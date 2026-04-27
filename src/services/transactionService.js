const mongoose = require('mongoose');
const Product = require('../models/Product');
const PriceHistory = require('../models/PriceHistory');
const Inventory = require('../models/Inventory');
const InventoryHistory = require('../models/InventoryHistory');
const { invalidateCache } = require('./redisService');

/**
 * Transaction Service (Priority 1 – Atomic Transactions Logic)
 * ─────────────────────────────────────────────────────────────────────────
 * Wraps all financial / inventory mutations in Mongoose sessions to guarantee
 * atomicity. Either both writes commit or both roll back — no partial states.
 *
 * Requirements from the project PDF:
 * ─ Price update  → MUST atomically write PriceHistory entry in same transaction.
 * ─ Inventory update → MUST atomically write InventoryHistory entry in same transaction.
 * ─ Negative inventory values are rejected before any write.
 * ─ Products are SOFT-DELETED (isDeleted: true) – never removed from the database.
 *
 * NOTE: Mongoose transactions require a replica set or Atlas cluster.
 *       For local dev without a replica set, set ENABLE_TRANSACTIONS=false in .env
 *       and the functions will operate without sessions (still atomic per-doc).
 */

const TRANSACTIONS_ENABLED = process.env.ENABLE_TRANSACTIONS === 'true';

/**
 * Creates a Mongoose session and starts a transaction if transactions are enabled.
 * Returns { session } – pass this into all Model operations as the `session` option.
 *
 * @returns {Promise<{ session: import('mongoose').ClientSession | null }>}
 */
async function startSession() {
  if (!TRANSACTIONS_ENABLED) return { session: null };
  const session = await mongoose.startSession();
  session.startTransaction();
  return { session };
}

/**
 * Commits or aborts a session based on the error state.
 *
 * @param {import('mongoose').ClientSession | null} session
 * @param {Error | null} error
 */
async function endSession(session, error = null) {
  if (!session) return;
  try {
    if (error) {
      await session.abortTransaction();
    } else {
      await session.commitTransaction();
    }
  } finally {
    session.endSession();
  }
}

// ── 1. Update Product Price (atomic with PriceHistory) ────────────────────────

/**
 * Atomically updates a product's basePrice and writes an immutable PriceHistory entry.
 *
 * @param {object}  params
 * @param {string}  params.productId   - MongoDB ObjectId string of the product
 * @param {number}  params.newPrice    - New base price (positive number)
 * @param {string}  params.adminId     - Admin user ObjectId string
 * @param {string}  [params.currencyCode='USD'] - ISO currency code
 * @param {number}  [params.exchangeRate]       - Optional FX rate at time of change
 * @returns {Promise<{ product: object, priceHistory: object }>}
 */
async function updateProductPrice({ productId, newPrice, adminId, currencyCode = 'USD' }) {
  if (newPrice < 0) {
    throw Object.assign(new Error('New price must be a non-negative value.'), { statusCode: 400 });
  }

  const { session } = await startSession();
  let error = null;

  try {
    const sessionOpts = session ? { session } : {};

    // Fetch current product (needed for oldPrice snapshot)
    const product = await Product.findOne({ _id: productId, isDeleted: false }).session(
      session || undefined
    );
    if (!product) {
      throw Object.assign(new Error('Product not found or has been deleted.'), { statusCode: 404 });
    }

    const oldPrice = product.basePrice;

    // 1a. Update product price
    product.basePrice = newPrice;
    await product.save(sessionOpts);

    // 1b. Write immutable PriceHistory entry (atomic with step 1a)
    const [priceHistory] = await PriceHistory.create(
      [
        {
          productId: product._id,
          oldPrice,
          newPrice,
          currencyCode,
          adminId,
          changeDate: new Date(),
        },
      ],
      sessionOpts
    );

    // Invalidate product cache
    await invalidateCache('products:*');

    await endSession(session);
    return { product, priceHistory };
  } catch (err) {
    error = err;
    await endSession(session, err);
    throw err;
  }
}

// ── 2. Update Inventory Quantity (atomic with InventoryHistory) ───────────────

/**
 * Atomically adjusts inventory quantity for a product at a specific location
 * and records the change in InventoryHistory.
 *
 * Constraints enforced:
 * - Quantity cannot go below 0 (non-negative stock invariant from PDF).
 * - Location must already exist in the Inventory document.
 * - Status is automatically recalculated based on the new quantity.
 *
 * @param {object} params
 * @param {string} params.productId    - Product ObjectId string
 * @param {string} params.locationName - Name of the warehouse/location
 * @param {number} params.delta        - Signed change (+N restocked, -N sold/removed)
 * @param {string} params.adminId      - Admin user ObjectId string
 * @param {string} [params.reason]     - Optional note for the change
 * @returns {Promise<{ inventory: object, historyEntry: object }>}
 */
async function updateInventoryQuantity({ productId, locationName, delta, adminId, reason = '' }) {
  if (typeof delta !== 'number' || !Number.isInteger(delta)) {
    throw Object.assign(new Error('delta must be an integer (positive or negative).'), {
      statusCode: 400,
    });
  }

  const { session } = await startSession();

  try {
    const sessionOpts = session ? { session } : {};

    // Fetch inventory document for this product
    const inventory = await Inventory.findOne({ productId }).session(session || undefined);
    if (!inventory) {
      throw Object.assign(new Error('Inventory record not found for this product.'), {
        statusCode: 404,
      });
    }

    // Locate the target warehouse location
    const loc = inventory.locations.find((l) => l.locationName === locationName);
    if (!loc) {
      throw Object.assign(
        new Error(`Location "${locationName}" not found in inventory.`),
        { statusCode: 404 }
      );
    }

    const oldQuantity = loc.availableQuantity;
    const newQuantity = oldQuantity + delta;

    // Enforce non-negative stock invariant
    if (newQuantity < 0) {
      throw Object.assign(
        new Error(
          `Insufficient stock. Current: ${oldQuantity}, requested delta: ${delta}. Result would be negative.`
        ),
        { statusCode: 409 }
      );
    }

    // Recalculate status
    loc.availableQuantity = newQuantity;
    loc.status =
      newQuantity === 0 ? 'Out of Stock' : newQuantity < 5 ? 'Low Stock' : 'Active';
    loc.lastRestocked = delta > 0 ? new Date() : loc.lastRestocked;

    await inventory.save(sessionOpts);

    // Write immutable audit entry
    const [historyEntry] = await InventoryHistory.create(
      [
        {
          productId,
          locationName,
          oldQuantity,
          newQuantity,
          delta,
          adminId,
          reason,
          timestamp: new Date(),
        },
      ],
      sessionOpts
    );

    // Invalidate product cache
    await invalidateCache('products:*');

    await endSession(session);
    return { inventory, historyEntry };
  } catch (err) {
    await endSession(session, err);
    throw err;
  }
}

// ── 3. Create Product with Inventory (atomic) ───────────────────────────────────

/**
 * Atomically creates a new product and its corresponding inventory record.
 * Ensures data integrity by using a transaction - if inventory creation fails,
 * the entire product creation is rolled back to prevent orphaned records.
 *
 * @param {object} params
 * @param {object} params.productData - Product creation data (title, description, category, basePrice, etc.)
 * @param {string} params.adminId - Admin user ObjectId string (for audit trail)
 * @returns {Promise<{ product: object, inventory: object }>}
 */
async function createProductWithInventory({ productData, adminId }) {
  if (TRANSACTIONS_ENABLED) {
    // Transactional path (for replica sets)
    const { session } = await startSession();
    let error = null;

    try {
      // 1. Create the product first
      const [product] = await Product.create([productData], { session });

      // 2. Create corresponding inventory record with default warehouse location
      const inventoryData = {
        productId: product._id,
        locations: [
          {
            locationName: 'المستودع الرئيسي',
            availableQuantity: 0,
            status: 'Out of Stock'
          }
        ]
      };
      
      const [inventory] = await Inventory.create([inventoryData], { session });

      // Invalidate product cache
      await invalidateCache('products:*');

      await endSession(session);
      
      console.log(`✓ Product and inventory created atomically: ${product._id}`);
      return { product, inventory };
    } catch (err) {
      error = err;
      await endSession(session, err);
      throw err;
    }
  } else {
    // Non-transactional path (for standalone MongoDB)
    try {
      // 1. Create the product first
      const [product] = await Product.create([productData]);

      // 2. Create corresponding inventory record with default warehouse location
      const inventoryData = {
        productId: product._id,
        locations: [
          {
            locationName: 'المستودع الرئيسي',
            availableQuantity: 0,
            status: 'Out of Stock'
          }
        ]
      };
      
      const [inventory] = await Inventory.create([inventoryData]);

      // Invalidate product cache
      await invalidateCache('products:*');
      
      console.log(`✓ Product and inventory created: ${product._id}`);
      return { product, inventory };
    } catch (err) {
      console.error('❌ Product/inventory creation failed:', err.message);
      throw err;
    }
  }
}

// ── 4. Soft Delete Product ────────────────────────────────────────────────────

/**
 * Soft-deletes a product by setting isDeleted: true.
 * The product record is NEVER removed from the database so that historical
 * orders and invoices (which reference originalProductID) remain valid.
 *
 * All subsequent queries on the Product model should filter { isDeleted: false }
 * by default (enforced by the query helper below or via model middleware).
 *
 * @param {string} productId - Product ObjectId string
 * @param {string} adminId   - Admin user ObjectId string (for audit log, already captured by middleware)
 * @returns {Promise<{ product: object }>}
 */
async function softDeleteProduct(productId, adminId) {
  const product = await Product.findOne({ _id: productId, isDeleted: false });
  if (!product) {
    throw Object.assign(new Error('Product not found or already deleted.'), { statusCode: 404 });
  }

  product.isDeleted = true;
  await product.save();

  console.log(
    `[TransactionService] Product ${productId} soft-deleted by admin ${adminId} at ${new Date().toISOString()}`
  );

  // Invalidate product cache
  await invalidateCache('products:*');

  return { product };
}

/**
 * Restore a previously soft-deleted product.
 *
 * @param {string} productId
 * @returns {Promise<{ product: object }>}
 */
async function restoreProduct(productId) {
  const product = await Product.findOne({ _id: productId, isDeleted: true });
  if (!product) {
    throw Object.assign(new Error('No soft-deleted product found with this ID.'), {
      statusCode: 404,
    });
  }

  product.isDeleted = false;
  await product.save();

  // Invalidate product cache
  await invalidateCache('products:*');

  return { product };
}

module.exports = {
  createProductWithInventory,
  updateProductPrice,
  updateInventoryQuantity,
  softDeleteProduct,
  restoreProduct,
};
