const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');

/**
 * Review Service (Priority 4 – Operations Manager: Reviews Gatekeeper)
 * ─────────────────────────────────────────────────────────────────────────
 * Manages the full review lifecycle: submission → pending → admin decision.
 *
 * Governance protocol (from PDF):
 * - New reviews enter as "Pending" – hidden from public, no rating impact.
 * - Only when admin approves does the product's averageRating update (atomic).
 * - Rejection marks the review "Rejected" and leaves averageRating unchanged.
 * - averageRating is recomputed from all "Approved" reviews on each approval
 *   (atomic findOneAndUpdate pattern to prevent race conditions).
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse Decimal128 to float safely.
 * @param {*} v
 * @returns {number}
 */
function toFloat(v) {
  if (!v) return 0;
  if (v instanceof mongoose.Types.Decimal128) return parseFloat(v.toString());
  return parseFloat(String(v)) || 0;
}

/**
 * Recompute averageRating for a product from all approved reviews.
 * Called atomically inside approval flow.
 *
 * @param {string | mongoose.Types.ObjectId} productId
 * @param {import('mongoose').ClientSession | null} session
 * @returns {Promise<number>} New average rating
 */
async function recomputeAverageRating(productId, session = null) {
  const pipeline = [
    { $match: { productId: new mongoose.Types.ObjectId(String(productId)), status: 'Approved' } },
    { $group: { _id: null, avg: { $avg: { $toDouble: '$rating' } }, count: { $sum: 1 } } },
  ];

  const sessionOpts = session ? { session } : {};
  const [result] = await Review.aggregate(pipeline).session(session || undefined);

  const newAverage = result ? parseFloat(result.avg.toFixed(2)) : 0;

  // Atomically update product averageRating
  await Product.findByIdAndUpdate(
    productId,
    { averageRating: String(newAverage) },
    { ...sessionOpts, returnDocument: 'after' }
  );

  return newAverage;
}

// ── 1. Submit a new review ────────────────────────────────────────────────────

/**
 * Create a new pending review submitted by a customer.
 * The product's averageRating is NOT touched at this stage.
 *
 * @param {object} params
 * @param {string} params.productId
 * @param {string} params.userId
 * @param {number} params.rating   - 1 to 5
 * @param {string} [params.comment]
 * @returns {Promise<object>} Created review document
 */
async function submitReview({ productId, userId, rating, comment = '' }) {
  // Validate product exists and is not deleted
  const product = await Product.findOne({ _id: productId, isDeleted: false }).lean();
  if (!product) {
    throw Object.assign(new Error('Product not found.'), { statusCode: 404 });
  }

  if (rating < 1 || rating > 5) {
    throw Object.assign(new Error('Rating must be between 1 and 5.'), { statusCode: 400 });
  }

  try {
    const review = await Review.create({
      productId,
      userId,
      rating: String(rating),
      comment,
      status: 'Pending',
    });
    return review;
  } catch (err) {
    if (err.code === 11000) {
      throw Object.assign(new Error('You have already submitted a review for this product.'), {
        statusCode: 409,
      });
    }
    throw err;
  }
}

// ── 2. Admin: Approve a review ────────────────────────────────────────────────

/**
 * Approves a pending review and atomically recalculates product averageRating.
 *
 * @param {string} reviewId  - Review ObjectId string
 * @param {string} adminId   - Admin user ObjectId string
 * @returns {Promise<{ review: object, newAverageRating: number }>}
 */
async function approveReview(reviewId, adminId) {
  const review = await Review.findOne({ _id: reviewId, status: 'Pending' });
  if (!review) {
    throw Object.assign(new Error('Pending review not found.'), { statusCode: 404 });
  }

  // Mark as approved
  review.status = 'Approved';
  review.reviewedBy = adminId;
  review.reviewedAt = new Date();
  await review.save();

  // Recalculate product average rating from all approved reviews
  const newAverageRating = await recomputeAverageRating(review.productId);

  return { review, newAverageRating };
}

// ── 3. Admin: Reject a review ─────────────────────────────────────────────────

/**
 * Rejects a pending review. Marks it "Rejected" and retains for audit trail.
 * Product averageRating is unchanged.
 *
 * @param {string} reviewId
 * @param {string} adminId
 * @returns {Promise<{ review: object }>}
 */
async function rejectReview(reviewId, adminId) {
  const review = await Review.findOne({ _id: reviewId, status: 'Pending' });
  if (!review) {
    throw Object.assign(new Error('Pending review not found.'), { statusCode: 404 });
  }

  review.status = 'Rejected';
  review.reviewedBy = adminId;
  review.reviewedAt = new Date();
  await review.save();

  return { review };
}

// ── 4. List reviews by status (admin view) ────────────────────────────────────

/**
 * Returns paginated reviews filtered by status.
 *
 * @param {object} [options]
 * @param {'Pending'|'Approved'|'Rejected'} [options.status='Pending']
 * @param {number}  [options.page=1]
 * @param {number}  [options.limit=20]
 * @returns {Promise<{ data: object[], total: number, page: number, pages: number }>}
 */
async function listReviews({ status = 'Pending', page = 1, limit = 20 } = {}) {
  const filter = status ? { status } : {};
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Review.find(filter)
      .populate('productId', 'title')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return { data, total, page, pages: Math.ceil(total / limit) };
}

// ── 5. Get public reviews for a product ──────────────────────────────────────

/**
 * Returns only Approved reviews for a product (public storefront use).
 *
 * @param {string} productId
 * @returns {Promise<object[]>}
 */
async function getApprovedReviews(productId) {
  return Review.find({ productId, status: 'Approved' })
    .populate('userId', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

module.exports = {
  submitReview,
  approveReview,
  rejectReview,
  listReviews,
  getApprovedReviews,
};
