const express = require('express');
const router = express.Router();

const transactionService = require('../../services/transactionService');
const localizationService = require('../../services/localizationService');
const { invalidateCache } = require('../../services/redisService');

const Product = require('../../models/Product');
const PriceHistory = require('../../models/PriceHistory');

// Helper: async error wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/admin/products
 * Paginated, filterable product list (includes soft-deleted if ?includeDeleted=true).
 *
 * Query params: page, limit, category, status (active|deleted), lang
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, category, includeDeleted, lang } = req.query;
    const language = lang || localizationService.detectLanguage(req);

    const filter = {};
    if (!includeDeleted || includeDeleted === 'false') filter.isDeleted = false;
    if (category) filter.category = category;

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Product.countDocuments(filter),
    ]);

    const localized = localizationService.localizeProducts(products, language);

    res.json({
      success: true,
      data: localized,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  })
);

/**
 * POST /api/admin/products
 * Create a new product with atomic inventory record creation.
 * Body: { title: {ar, en}, description: {ar, en}, category, basePrice, currency, images, specifications }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = await transactionService.createProductWithInventory({
      productData: req.body,
      adminId: req.user._id.toString()
    });
    res.status(201).json({ success: true, data: result.product });
  })
);

/**
 * GET /api/admin/products/:id
 * Get a single product by ID (admin can see deleted products).
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const lang = localizationService.detectLanguage(req);
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.json({ success: true, data: localizationService.localizeProduct(product, lang) });
  })
);

/**
 * PATCH /api/admin/products/:id/price
 * Atomically update product price + write PriceHistory.
 * Body: { newPrice, currencyCode? }
 */
router.patch(
  '/:id/price',
  asyncHandler(async (req, res) => {
    const { newPrice, currencyCode } = req.body;
    if (newPrice === undefined) {
      return res.status(400).json({ message: 'newPrice is required.' });
    }

    const result = await transactionService.updateProductPrice({
      productId: req.params.id,
      newPrice: parseFloat(newPrice),
      adminId: req.user._id,
      currencyCode: currencyCode || 'USD',
    });

    res.json({ success: true, data: result });
  })
);

/**
 * PATCH /api/admin/products/:id
 * General product update (non-price fields: title, description, category, images, etc.)
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    // Prevent updating price via this endpoint (use /price endpoint for atomic ops)
    const { basePrice, ...updates } = req.body;

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    ).lean();

    if (!product) return res.status(404).json({ message: 'Product not found.' });
    
    // Invalidate product cache
    await invalidateCache('products:*');
    
    res.json({ success: true, data: product });
  })
);

/**
 * DELETE /api/admin/products/:id
 * Soft-delete a product. Sets isDeleted: true.
 * Historical orders referencing this product remain valid.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await transactionService.softDeleteProduct(
      req.params.id,
      req.user._id.toString()
    );
    res.json({ success: true, message: 'Product soft-deleted.', data: result.product });
  })
);

/**
 * PATCH /api/admin/products/:id/restore
 * Restore a soft-deleted product.
 */
router.patch(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const result = await transactionService.restoreProduct(req.params.id);
    res.json({ success: true, message: 'Product restored.', data: result.product });
  })
);

/**
 * GET /api/admin/products/:id/price-history
 * Returns the full price change audit trail for a product.
 */
router.get(
  '/:id/price-history',
  asyncHandler(async (req, res) => {
    const history = await PriceHistory.find({ productId: req.params.id })
      .sort({ changeDate: -1 })
      .populate('adminId', 'name email')
      .lean();
    res.json({ success: true, data: history });
  })
);

module.exports = router;
