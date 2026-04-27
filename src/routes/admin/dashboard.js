const express = require('express');
const router = express.Router();

const statsService = require('../../services/statsService');
const inventoryService = require('../../services/inventoryService');
const localizationService = require('../../services/localizationService');

const Order = require('../../models/Order');

// Helper: async error wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/admin/dashboard/stats
 * Returns pre-aggregated KPI metrics for the admin dashboard.
 * O(1) read from GlobalStats singleton.
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const stats = await statsService.getDashboardStats();
    res.json({ success: true, data: stats });
  })
);

/**
 * GET /api/admin/dashboard/low-stock
 * Returns products with quantity below the low-stock threshold.
 * Feeds the "System Alerts" section on the dashboard.
 */
router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const lang = localizationService.detectLanguage(req);
    const alerts = await inventoryService.getLowStockAlerts();

    // Localize product titles for the dashboard
    const localized = alerts.map((a) => ({
      ...a,
      productTitle: localizationService.getLocalizedText(a.productTitle, lang),
    }));

    res.json({ success: true, data: localized });
  })
);

/**
 * GET /api/admin/dashboard/orders
 * Returns recent orders (last 30) for the dashboard orders table.
 */
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(30)
      .select('orderNumber userId totalAmount currencyCode currentStatus createdAt')
      .populate('userId', 'name email')
      .lean();
    res.json({ success: true, data: orders });
  })
);

module.exports = router;
