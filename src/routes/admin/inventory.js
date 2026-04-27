const express = require('express');
const router = express.Router();

const inventoryService = require('../../services/inventoryService');
const transactionService = require('../../services/transactionService');

const Product = require('../../models/Product');
const InventoryHistory = require('../../models/InventoryHistory');

// Helper: async error wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/admin/inventory
 * Paginated inventory listing for the admin inventory tab.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const result = await inventoryService.listInventory({
      page: Number(page),
      limit: Number(limit),
    });
    res.json({ success: true, ...result });
  })
);

/**
 * PATCH /api/admin/inventory/:productId
 * Update inventory quantity for a specific product location.
 * Body: { locationName, delta, reason? }
 * 
 * 🔧 FIX #4: Standardized error responses with clear error codes
 */
router.patch(
  '/:productId',
  asyncHandler(async (req, res) => {
    const { locationName, delta, reason } = req.body;
    if (!locationName || delta === undefined) {
      return res.status(400).json({ 
        status: 'error',
        code: 'INVALID_REQUEST',
        message: 'locationName and delta are required.' 
      });
    }

    try {
      // Verify product exists first
      const product = await Product.findById(req.params.productId);
      if (!product) {
        return res.status(404).json({
          status: 'error',
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with ID ${req.params.productId} does not exist.`
        });
      }

      const result = await transactionService.updateInventoryQuantity({
        productId: req.params.productId,
        locationName,
        delta: parseInt(delta, 10),
        adminId: req.user._id,
        reason: reason || '',
      });

      res.json({ status: 'success', code: 'INVENTORY_UPDATED', data: result });
    } catch (err) {
      // Standardize error responses
      if (err.statusCode === 404) {
        return res.status(404).json({
          status: 'error',
          code: 'INVENTORY_NOT_FOUND',
          message: err.message || 'Inventory record not found for this product.'
        });
      } else if (err.statusCode === 409) {
        return res.status(409).json({
          status: 'error',
          code: 'INSUFFICIENT_STOCK',
          message: err.message || 'Operation would result in negative inventory.'
        });
      }
      throw err; // Let error handler deal with other errors
    }
  })
);

/**
 * GET /api/admin/inventory/:productId/history
 * Returns the audit trail of inventory changes for a product.
 */
router.get(
  '/:productId/history',
  asyncHandler(async (req, res) => {
    const history = await InventoryHistory.find({ productId: req.params.productId })
      .sort({ timestamp: -1 })
      .populate('adminId', 'name email')
      .lean();
    res.json({ success: true, data: history });
  })
);

module.exports = router;
