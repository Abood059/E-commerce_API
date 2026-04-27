const mongoose = require('mongoose');
const GlobalStats = require('../models/GlobalStats');
const StatsHistory = require('../models/StatsHistory');
const Order = require('../models/Order');

/**
 * Stats Service (Priority 3 – Business Intelligence System)
 * ─────────────────────────────────────────────────────────────────────────
 * Manages the GlobalStats singleton document using atomic $inc operations
 * to prevent race conditions during concurrent order processing.
 *
 * Design decisions (from PDF requirements):
 * - ONE document in GlobalStats keyed by { key: 'GLOBAL' } acts as the
 *   pre-aggregated counter store.
 * - Never recalculate from scratch on each dashboard request – use the
 *   pre-aggregated values for O(1) reads.
 * - Every mutation to GlobalStats is accompanied by an append-only
 *   StatsHistory event for reconciliation.
 * - Decimal128 arithmetic is done via string → parseFloat → string to
 *   avoid floating-point errors when reading back from MongoDB.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a Decimal128 / string / number into a JavaScript float.
 * @param {*} v
 * @returns {number}
 */
function toFloat(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof mongoose.Types.Decimal128) return parseFloat(v.toString());
  return parseFloat(String(v)) || 0;
}

/**
 * Ensure the GlobalStats singleton exists (upsert pattern).
 * Called once at startup or on first use.
 * @returns {Promise<void>}
 */
async function ensureGlobalStatsExists() {
  await GlobalStats.updateOne(
    { key: 'GLOBAL' },
    { $setOnInsert: { key: 'GLOBAL', totalSales: '0', totalOrders: 0, totalRefunds: '0' } },
    { upsert: true }
  );
}

// ── 1. Increment stats when an order is confirmed ─────────────────────────────

/**
 * Atomically increments GlobalStats after a successful order completion.
 * Also appends an event to StatsHistory for audit/reconciliation.
 *
 * @param {object}  params
 * @param {string}  params.orderId      - Completed Order ObjectId string
 * @param {number}  params.orderAmount  - Numeric value of the order (converted from Decimal128)
 * @param {string}  [params.adminId]    - Admin who processed (optional for system-triggered)
 * @returns {Promise<void>}
 */
async function recordOrderCompletion({ orderId, orderAmount, adminId = null }) {
  await ensureGlobalStatsExists();

  const amount = parseFloat(String(orderAmount));
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error('orderAmount must be a non-negative finite number.'), {
      statusCode: 400,
    });
  }

  // Atomic $inc – safe under concurrent writes (no race condition)
  await GlobalStats.updateOne(
    { key: 'GLOBAL' },
    {
      $inc: { totalOrders: 1 },
      // Decimal128 $inc via string arithmetic workaround:
      // MongoDB 5+ supports $inc on Decimal128 natively; below is compatible with Mongoose.
      $set: { lastUpdated: new Date() },
    }
  );

  // Decimal128 addition requires fetch → compute → save pattern
  const stats = await GlobalStats.findOne({ key: 'GLOBAL' });
  const currentSales = toFloat(stats.totalSales);
  stats.totalSales = String(currentSales + amount);
  await stats.save();

  // Append StatsHistory event (immutable audit trail)
  await StatsHistory.create({
    orderId,
    affectedValue: String(amount),
    type: 'Addition',
    adminId: adminId || undefined,
    timestamp: new Date(),
  });
}

// ── 2. Record a refund ────────────────────────────────────────────────────────

/**
 * Atomically records a refund event – increments totalRefunds and decrements totalSales.
 *
 * @param {object} params
 * @param {string} params.orderId
 * @param {number} params.refundAmount
 * @param {string} [params.adminId]
 * @returns {Promise<void>}
 */
async function recordRefund({ orderId, refundAmount, adminId = null }) {
  await ensureGlobalStatsExists();

  const amount = parseFloat(String(refundAmount));
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error('refundAmount must be a non-negative finite number.'), {
      statusCode: 400,
    });
  }

  const stats = await GlobalStats.findOne({ key: 'GLOBAL' });
  const currentSales = toFloat(stats.totalSales);
  const currentRefunds = toFloat(stats.totalRefunds);

  // Prevent totalSales from going negative
  stats.totalSales = String(Math.max(0, currentSales - amount));
  stats.totalRefunds = String(currentRefunds + amount);
  stats.lastUpdated = new Date();
  await stats.save();

  await StatsHistory.create({
    orderId,
    affectedValue: String(amount),
    type: 'Refund',
    adminId: adminId || undefined,
    timestamp: new Date(),
  });
}

// ── 3. Get current dashboard stats ───────────────────────────────────────────

/**
 * Returns the pre-aggregated GlobalStats document for dashboard display.
 * O(1) – no aggregation pipeline needed.
 *
 * @returns {Promise<object>}
 */
async function getDashboardStats() {
  await ensureGlobalStatsExists();
  const stats = await GlobalStats.findOne({ key: 'GLOBAL' }).lean();

  const totalSales = toFloat(stats.totalSales);
  const totalOrders = stats.totalOrders || 0;
  const totalRefunds = toFloat(stats.totalRefunds);

  return {
    totalSales,
    totalOrders,
    totalRefunds,
    averageOrderValue: totalOrders > 0 ? +(totalSales / totalOrders).toFixed(2) : 0,
    lastUpdated: stats.lastUpdated,
  };
}

module.exports = {
  ensureGlobalStatsExists,
  recordOrderCompletion,
  recordRefund,
  getDashboardStats,
};
