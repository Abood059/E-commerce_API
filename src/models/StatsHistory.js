const mongoose = require('mongoose');

const { Schema } = mongoose;
const { toDecimal128, validateNonNegative } = require('./_shared');

/**
 * Stats History Collection (PDF requirements):
 * - Immutable event log used for audit/reconciliation.
 * - Must include: orderId, affectedValue (Decimal128), type, timestamp.
 *
 * Governance note (PDF):
 * - Any mutation to cumulative GlobalStats must be accompanied by an append-only event
 *   in this collection to preserve an audit trail and enable rebuild/reconciliation.
 */

// Financial integrity helpers are centralized in ./_shared.js (shared utilities pattern).

const StatsHistorySchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },

    affectedValue: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'affectedValue must be a non-negative Decimal128 value.',
      },
    },

    type: {
      type: String,
      required: true,
      immutable: true,
      enum: ['Addition', 'Deduction', 'Refund'],
      index: true,
    },

    /**
     * Audit trail (requested):
     * - Record the admin (User) associated with the financial adjustment event.
     */
    adminId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true, index: true },

    timestamp: { type: Date, default: Date.now, required: true, immutable: true, index: true },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Immutability enforcement (audit compliance):
 * - This is an append-only event log; updates would destroy reconciliation guarantees.
 */
function blockUpdates(next) {
  next(new Error('StatsHistory is immutable: updates are not allowed (append-only audit log).'));
}

StatsHistorySchema.pre('updateOne', blockUpdates);
StatsHistorySchema.pre('updateMany', blockUpdates);
StatsHistorySchema.pre('findOneAndUpdate', blockUpdates);
StatsHistorySchema.pre('replaceOne', blockUpdates);

StatsHistorySchema.index({ timestamp: -1 });
StatsHistorySchema.index({ orderId: 1, timestamp: -1 });

module.exports = mongoose.model('StatsHistory', StatsHistorySchema);

