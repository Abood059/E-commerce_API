const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const GlobalStats = require('../models/GlobalStats');
const StatsHistory = require('../models/StatsHistory');
const { getLocalized } = require('../models/_shared');

const TRANSACTIONS_ENABLED = process.env.ENABLE_TRANSACTIONS !== 'false';

/**
 * Creates a Mongoose session and starts a transaction if enabled.
 */
async function startSession() {
  if (!TRANSACTIONS_ENABLED) return { session: null };
  const session = await mongoose.startSession();
  session.startTransaction();
  return { session };
}

/**
 * Commits or aborts a session based on the error state.
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

/**
 * Helper to dispatch async notifications.
 * Phase 3: Post-hooks (Async)
 */
async function dispatchNotifications(order, lang) {
  // Mock notification dispatcher
  // In real life, this would push to an event queue (e.g., RabbitMQ, SQS)
  console.log(`[Notification] Sending order confirmation to User ${order.userId} in language: ${lang}`);
}

async function triggerLowStockAlert(productId, locationName, remainingQty) {
  // Mock internal notification
  console.log(`[Alert] Low stock for Product ${productId} at ${locationName}. Remaining: ${remainingQty}`);
}

/**
 * Enhanced Checkout Process Service
 */
class CheckoutService {
  /**
   * Process checkout from cart to order.
   * 
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.locationName - Selected inventory location
   * @param {Object} params.addressInfo - Delivery address
   * @param {string} params.preferredLanguage - 'ar' or 'en'
   * @param {number} params.taxRate - Tax rate percentage (e.g., 0.15 for 15%)
   * @param {number} params.discount - Discount amount applied
   * @param {string} params.currencyCode - Target currency
   * @param {number} params.exchangeRate - Exchange rate from base to target
   */
  async processCheckout({
    userId,
    locationName,
    addressInfo,
    preferredLanguage = 'ar',
    taxRate = 0,
    discount = 0,
    currencyCode = 'USD',
    exchangeRate = 1
  }) {
    // ── Phase 1: Pre-transaction validation ──────────────────────────────────
    
    // 1. Fetch Cart
    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) {
      throw Object.assign(new Error('Cart is empty or not found.'), { statusCode: 400 });
    }

    const cartItems = cart.items;
    const productIds = cartItems.map(item => item.productId);

    // 2. Fetch Products
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    // 3. Fetch Inventory
    const inventories = await Inventory.find({ productId: { $in: productIds } });
    const inventoryMap = new Map(inventories.map(inv => [inv.productId.toString(), inv]));

    let calculatedTotal = 0;
    const validatedLineItems = [];

    for (const item of cartItems) {
      const product = productMap.get(item.productId.toString());
      
      // Ensure product exists and is not deleted
      if (!product || product.isDeleted) {
        throw Object.assign(new Error(`Product ${item.productId} is no longer available.`), { statusCode: 400 });
      }

      // Compare Cart.price with Product.basePrice (Price change confirmation)
      const cartPrice = parseFloat(item.priceSnapshot.toString());
      const currentPrice = parseFloat(product.basePrice.toString());

      if (cartPrice !== currentPrice) {
        throw Object.assign(
          new Error(`Price changed for product ${product._id}. Please review your cart.`),
          { statusCode: 409, type: 'PRICE_MISMATCH', productId: product._id }
        );
      }

      // Check Inventory
      const inventory = inventoryMap.get(product._id.toString());
      if (!inventory) {
        throw Object.assign(new Error(`Inventory not found for product ${product._id}.`), { statusCode: 404 });
      }

      const location = inventory.locations.find(l => l.locationName === locationName);
      if (!location) {
        throw Object.assign(new Error(`Location ${locationName} not found for product ${product._id}.`), { statusCode: 400 });
      }

      if (item.quantity > location.availableQuantity) {
        throw Object.assign(
          new Error(`Insufficient stock for product ${product._id}. Available: ${location.availableQuantity}`),
          { statusCode: 400 }
        );
      }

      // Multi-language fallback (Arabic is default)
      let title = '';
      if (product.title && product.title[preferredLanguage]) {
        title = product.title[preferredLanguage];
      } else {
        title = product.title['ar'] || 'بدون اسم';
      }

      // Calculate totals
      const lineItemTax = currentPrice * taxRate * item.quantity;
      const lineItemTotal = (currentPrice * item.quantity) + lineItemTax;
      calculatedTotal += lineItemTotal;

      validatedLineItems.push({
        originalProductID: product._id,
        title: title,
        priceAtPurchase: mongoose.Types.Decimal128.fromString(currentPrice.toString()),
        tax: mongoose.Types.Decimal128.fromString((currentPrice * taxRate).toString()),
        discount: mongoose.Types.Decimal128.fromString('0'), // Line item discount logic if any
        thumbnailUrl: product.images && product.images.length > 0 ? product.images[0] : 'https://placeholder.com/150',
        quantity: item.quantity,
        isReturned: false
      });
    }

    // Apply global discount
    calculatedTotal = Math.max(0, calculatedTotal - discount);

    // ── Phase 2: Atomic Transaction (Unit of Work) ───────────────────────────
    const { session } = await startSession();
    let error = null;
    let newOrder = null;
    let lowStockItems = [];

    try {
      const sessionOpts = session ? { session } : {};

      // 1. Deduct Inventory (Optimistic Locking & Write)
      for (const item of cartItems) {
        const inventory = inventoryMap.get(item.productId.toString());
        const locIndex = inventory.locations.findIndex(l => l.locationName === locationName);
        
        inventory.locations[locIndex].availableQuantity -= item.quantity;
        
        // Recalculate status
        const newQty = inventory.locations[locIndex].availableQuantity;
        inventory.locations[locIndex].status = newQty === 0 ? 'Out of Stock' : newQty < 5 ? 'Low Stock' : 'Active';
        
        if (newQty < 5) {
          lowStockItems.push({ productId: inventory.productId, locationName, remainingQty: newQty });
        }

        await inventory.save(sessionOpts);
      }

      // 2. Create Order Document (Snapshot Engine)
      newOrder = new Order({
        orderNumber: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: userId,
        purchasedInLanguage: preferredLanguage,
        lineItems: validatedLineItems,
        totalAmount: mongoose.Types.Decimal128.fromString(calculatedTotal.toString()),
        currencyCode: currencyCode,
        exchangeRate: mongoose.Types.Decimal128.fromString(exchangeRate.toString()),
        addressSnapshot: addressInfo,
        currentStatus: 'Pending',
        schemaVersion: 1, // Enforced backward compatibility
        lockVersion: 1
      });

      await newOrder.save(sessionOpts);

      // 3. Update Global Stats
      let stats = await GlobalStats.findOne({ key: 'GLOBAL' }).session(sessionOpts);
      if (!stats) {
        stats = new GlobalStats({ key: 'GLOBAL' });
      }

      const currentTotalSales = parseFloat(stats.totalSales.toString());
      const newTotalSales = currentTotalSales + calculatedTotal;
      
      stats.totalSales = mongoose.Types.Decimal128.fromString(newTotalSales.toString());
      stats.totalOrders += 1;
      await stats.save(sessionOpts);

      // 4. Audit Logging (StatsHistory)
      await StatsHistory.create([{
        orderId: newOrder._id,
        affectedValue: mongoose.Types.Decimal128.fromString(calculatedTotal.toString()),
        type: 'Addition',
        timestamp: new Date()
      }], sessionOpts);

      // 5. Clear Cart
      await Cart.deleteOne({ userId }).session(sessionOpts);

      await endSession(session);
    } catch (err) {
      // Transaction Failure Handler
      error = err;
      await endSession(session, err);
      
      if (err.name === 'VersionError') {
        throw Object.assign(new Error('Concurrency conflict: Please refresh your cart and try again.'), { statusCode: 409 });
      }
      
      throw Object.assign(new Error(`Checkout failed: ${err.message}`), { statusCode: 500 });
    }

    // ── Phase 3: Post-hooks (Async) ──────────────────────────────────────────
    
    // Execute asynchronously without blocking the response
    setImmediate(async () => {
      try {
        // Dispatch Notification
        await dispatchNotifications(newOrder, preferredLanguage);

        // Low stock alerts
        for (const ls of lowStockItems) {
          await triggerLowStockAlert(ls.productId, ls.locationName, ls.remainingQty);
        }
      } catch (postHookErr) {
        console.error('[Post-hook Error]', postHookErr);
      }
    });

    return newOrder;
  }
}

module.exports = new CheckoutService();
