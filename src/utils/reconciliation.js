const mongoose = require('mongoose');
const GlobalStats = require('../models/GlobalStats');
const StatsHistory = require('../models/StatsHistory');
const Order = require('../models/Order');

/**
 * Reconciliation Utility (Priority 3 – Business Intelligence System)
 * ─────────────────────────────────────────────────────────────────────────
 * On-demand integrity check that scans all Orders, recomputes aggregate metrics
 * from raw data, and compares against the GlobalStats document.
 *
 * Governance intent (from PDF):
 * - GlobalStats is updated via event-driven $inc (fast path).
 * - Reconciliation is the slow-path sanity check (run periodically or on-demand).
 * - Discrepancies are logged; optionally corrected when { fix: true } is passed.
 *
 * This function is exposed via an admin-only endpoint (GET /api/admin/reconcile).
 * It should NEVER be called on every request.
 */

/**
 * Parse Decimal128 / string / number to float.
 * @param {*} v
 * @returns {number}
 */
function toFloat(v) {
  if (v === null || v === undefined) return 0;
  if (v instanceof mongoose.Types.Decimal128) return parseFloat(v.toString());
  return parseFloat(String(v)) || 0;
}

/**
 * Run a full reconciliation scan.
 *
 * @param {object}  [options]
 * @param {boolean} [options.fix=false]  - If true, update GlobalStats with recalculated values
 * @returns {Promise<object>} Reconciliation report
 */
async function runReconciliation({ fix = false } = {}) {
  console.log('[Reconciliation] Starting reconciliation scan...');

  // ── Step 1: Aggregate from raw Order documents ────────────────────────────
  const pipeline = [
    { $match: { currentStatus: { $in: ['Delivered', 'Paid', 'Processing', 'Shipped'] } } },
    {
      $group: {
        _id: null,
        computedRevenue: { $sum: { $toDouble: '$totalAmount' } },
        computedOrderCount: { $sum: 1 },
      },
    },
  ];

  const [aggregated] = await Order.aggregate(pipeline);

  const computedRevenue = aggregated ? parseFloat(aggregated.computedRevenue.toFixed(2)) : 0;
  const computedOrderCount = aggregated ? aggregated.computedOrderCount : 0;
  const computedAverage =
    computedOrderCount > 0 ? +(computedRevenue / computedOrderCount).toFixed(2) : 0;

  // ── Step 2: Fetch current GlobalStats ─────────────────────────────────────
  const stats = await GlobalStats.findOne({ key: 'GLOBAL' });
  if (!stats) {
    return {
      status: 'error',
      message: 'GlobalStats document not found. Run ensureGlobalStatsExists() first.',
    };
  }

  const storedRevenue = parseFloat(toFloat(stats.totalSales).toFixed(2));
  const storedOrderCount = stats.totalOrders || 0;
  const storedAverage =
    storedOrderCount > 0 ? +(storedRevenue / storedOrderCount).toFixed(2) : 0;

  // ── Step 3: Compare ────────────────────────────────────────────────────────
  const discrepancies = [];

  const revenueDiff = Math.abs(computedRevenue - storedRevenue);
  if (revenueDiff > 0.01) {
    discrepancies.push({
      field: 'totalSales',
      stored: storedRevenue,
      computed: computedRevenue,
      diff: +(computedRevenue - storedRevenue).toFixed(2),
    });
  }

  const orderCountDiff = Math.abs(computedOrderCount - storedOrderCount);
  if (orderCountDiff > 0) {
    discrepancies.push({
      field: 'totalOrders',
      stored: storedOrderCount,
      computed: computedOrderCount,
      diff: computedOrderCount - storedOrderCount,
    });
  }

  const report = {
    runAt: new Date().toISOString(),
    computed: {
      totalSales: computedRevenue,
      totalOrders: computedOrderCount,
      averageOrderValue: computedAverage,
    },
    stored: {
      totalSales: storedRevenue,
      totalOrders: storedOrderCount,
      averageOrderValue: storedAverage,
    },
    discrepancies,
    hasDiscrepancies: discrepancies.length > 0,
  };

  if (discrepancies.length > 0) {
    console.warn('[Reconciliation] Discrepancies detected:', JSON.stringify(discrepancies, null, 2));
  } else {
    console.log('[Reconciliation] ✓ GlobalStats is consistent with order data.');
  }

  // ── Step 4: Optionally fix ─────────────────────────────────────────────────
  if (fix && discrepancies.length > 0) {
    stats.totalSales = String(computedRevenue);
    stats.totalOrders = computedOrderCount;
    stats.lastUpdated = new Date();
    await stats.save();
    report.fixed = true;
    console.log('[Reconciliation] GlobalStats corrected with computed values.');
  }

  return report;
}

module.exports = { runReconciliation };
