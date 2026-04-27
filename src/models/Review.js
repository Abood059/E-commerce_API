const mongoose = require('mongoose');

const { Schema } = mongoose;
const { toDecimal128, validateNonNegative } = require('./_shared');

/**
 * Reviews Collection
 * ─────────────────────────────────────────────
 * Customer product reviews with admin-gated approval workflow.
 *
 * Governance protocol (PDF):
 * - New reviews enter as "Pending" and are hidden from public display.
 * - Only "Approved" reviews are included in averageRating calculations.
 * - Admin approval atomically updates productId.averageRating in the Products collection.
 * - "Rejected" reviews are retained for audit purposes (soft-reject pattern).
 *
 * Rating field uses Decimal128 for financial precision consistency across the schema.
 */
const ReviewSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },

    /**
     * Rating: 1–5 scale stored as Decimal128 for schema consistency.
     * Immutable after creation – customers cannot change ratings (admin-only).
     */
    rating: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: [
        {
          validator: validateNonNegative,
          message: 'rating must be a non-negative Decimal128 value.',
        },
        {
          validator: (v) => v && Number(v.toString()) <= 5,
          message: 'rating must not exceed 5.',
        },
      ],
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    /**
     * Approval workflow status (PDF requirement):
     * - "Pending"  → awaiting admin review; hidden from public
     * - "Approved" → visible; included in averageRating calculation
     * - "Rejected" → hidden; retained for audit trail
     */
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },

    /** Admin who approved or rejected (audit trail) */
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ── Compound indexes ──────────────────────────────────────────────────────────
ReviewSchema.index({ productId: 1, status: 1 });
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true }); // One review per user per product

module.exports = mongoose.model('Review', ReviewSchema);
