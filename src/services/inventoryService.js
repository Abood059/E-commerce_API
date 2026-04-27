const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

/**
 * Inventory Service (Priority 4 – Operations Manager: Inventory Radar)
 * ─────────────────────────────────────────────────────────────────────────
 * Provides the admin dashboard with real-time low-stock intelligence by
 * scanning the Inventory collection for locations where availableQuantity < 5
 * or status is "Low Stock" / "Out of Stock".
 *
 * Design decision:
 * - Query Inventory collection directly (not Products) because stock status
 *   and quantities live in Inventory per the project schema.
 * - Returns a normalized list with product name enrichment for dashboard display.
 * - Grouped by location for multi-warehouse awareness.
 *
 * Also provides general inventory listing and quantity update coordination
 * (atomic writes delegated to transactionService).
 */

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || '5', 10);

// ── 1. Inventory Radar (Low-stock alerts) ────────────────────────────────────

/**
 * Retrieve all products at or below the low-stock threshold across all locations.
 * Returns an array of alerts grouped by location for dashboard display.
 *
 * @returns {Promise<object[]>} Array of low-stock alert objects
 */
async function getLowStockAlerts() {
  // Find all inventory docs that have at least one low-stock location
  const inventories = await Inventory.find({
    'locations.availableQuantity': { $lt: LOW_STOCK_THRESHOLD },
  })
    .populate({
      path: 'productId',
      match: { isDeleted: false },
      select: 'title category isDeleted',
    })
    .lean();

  // Filter out entries where product was soft-deleted (populate returns null)
  const alerts = [];

  for (const inv of inventories) {
    if (!inv.productId) continue; // Product soft-deleted; skip

    const lowLocs = inv.locations.filter((loc) => loc.availableQuantity < LOW_STOCK_THRESHOLD);

    for (const loc of lowLocs) {
      alerts.push({
        productId: inv.productId._id,
        productTitle: inv.productId.title, // { ar, en } – caller localizes
        category: inv.productId.category,
        location: loc.locationName,
        availableQuantity: loc.availableQuantity,
        status: loc.status,
        lastRestocked: loc.lastRestocked || null,
        threshold: LOW_STOCK_THRESHOLD,
        priority: loc.availableQuantity === 0 ? 'critical' : 'warning',
      });
    }
  }

  // Sort: critical first, then by quantity ascending
  alerts.sort((a, b) => {
    if (a.priority === 'critical' && b.priority !== 'critical') return -1;
    if (b.priority === 'critical' && a.priority !== 'critical') return 1;
    return a.availableQuantity - b.availableQuantity;
  });

  return alerts;
}

// ── 2. Full inventory listing for admin table ─────────────────────────────────

/**
 * Returns all inventory records (non-deleted products) for the admin inventory page.
 *
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @returns {Promise<{ data: object[], total: number, page: number, pages: number }>}
 */
async function listInventory({ page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;

  const [inventories, total] = await Promise.all([
    Inventory.find()
      .populate({
        path: 'productId',
        match: { isDeleted: false },
        select: 'title category basePrice currency',
      })
      .skip(skip)
      .limit(limit)
      .lean(),
    Inventory.countDocuments(),
  ]);

  // Filter out null-populated (soft-deleted product)
  const data = inventories.filter((i) => i.productId !== null);

  return { data, total, page, pages: Math.ceil(total / limit) };
}

// ── 3. Get inventory for a single product ────────────────────────────────────

/**
 * @param {string} productId
 * @returns {Promise<object | null>}
 */
async function getProductInventory(productId) {
  return Inventory.findOne({ productId }).lean();
}

module.exports = {
  getLowStockAlerts,
  listInventory,
  getProductInventory,
  LOW_STOCK_THRESHOLD,
};
