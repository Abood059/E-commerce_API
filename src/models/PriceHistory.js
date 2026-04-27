const mongoose = require('mongoose');

const { Schema } = mongoose;
const { toDecimal128, validateNonNegative } = require('./_shared');

/**
 * Price History Collection (PDF requirements):
 * - Immutable audit log of price changes, linked N:1 to Product.
 * - Must store: productId, oldPrice, newPrice, currencyCode, adminId, changeDate.
 * - Financial precision: Decimal128 for currency values.
 * - Audit trail: adminId must be recorded.
 *
 * Governance note (PDF): creation of this log must be coupled atomically with the Product
 * price update in a single transaction. That orchestration happens at the service layer;
 * this schema enforces immutability and integrity of the stored audit records.
 */

// Financial integrity helpers are centralized in ./_shared.js (project docs requirement).

const PriceHistorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
      index: true,
    },

    oldPrice: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'oldPrice must be a non-negative Decimal128 value.',
      },
    },

    newPrice: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'newPrice must be a non-negative Decimal128 value.',
      },
    },

    currencyCode: { type: String, required: true, trim: true, immutable: true },

    /**
     * Audit trail requirement (PDF):
     * - Record which admin performed the change.
     * - Per your project clarification: admin is also a User.
     */
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },

    changeDate: { type: Date, default: Date.now, immutable: true, index: true },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Immutability enforcement (legal/audit compliance):
 * - Audit logs must not be editable after creation.
 * - Mongoose `immutable: true` protects document saves, but update queries can bypass it.
 * - These guards hard-block any update-style operations on this collection.
 */
function blockUpdates(next) {
  next(new Error('PriceHistory is immutable: updates are not allowed (insert-only audit log).'));
}

PriceHistorySchema.pre('updateOne', blockUpdates);
PriceHistorySchema.pre('updateMany', blockUpdates);
PriceHistorySchema.pre('findOneAndUpdate', blockUpdates);
PriceHistorySchema.pre('replaceOne', blockUpdates);

/**
 * Query optimization:
 * - Efficient per-product timeline queries.
 */
PriceHistorySchema.index({ productId: 1, changeDate: -1 });

module.exports = mongoose.model('PriceHistory', PriceHistorySchema);
