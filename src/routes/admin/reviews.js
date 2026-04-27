const express = require('express');
const router = express.Router();

const reviewService = require('../../services/reviewService');

// Helper: async error wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/admin/reviews
 * Paginated reviews list, filtered by status (default: Pending).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status = 'Pending', page = 1, limit = 20 } = req.query;
    const result = await reviewService.listReviews({ status, page: Number(page), limit: Number(limit) });
    res.json({ success: true, ...result });
  })
);

/**
 * PATCH /api/admin/reviews/:id/approve
 * Approve a pending review. Atomically recalculates product averageRating.
 */
router.patch(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const result = await reviewService.approveReview(req.params.id, req.user._id.toString());
    res.json({ success: true, data: result });
  })
);

/**
 * PATCH /api/admin/reviews/:id/reject
 * Reject a pending review. AverageRating is unchanged.
 */
router.patch(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const result = await reviewService.rejectReview(req.params.id, req.user._id.toString());
    res.json({ success: true, data: result });
  })
);

module.exports = router;
