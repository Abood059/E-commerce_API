const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Inventory History Collection
 * ─────────────────────────────────────────────
 * Immutable audit log for every inventory quantity change.
 *
 * Governance protocol (PDF):
 * - Every quantity update to the Inventory collection MUST atomically create
 *   a corresponding entry here (via Mongoose session/transaction at the service layer).
 * - Records are append-only; updates/deletes are hard-blocked.
 *
 * Tracks: product, location, oldQty → newQty, admin, reason, timestamp.
 */
const InventoryHistorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
      index: true,
    },

    locationName: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    oldQuantity: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },

    newQuantity: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },

    delta: {
      type: Number,
      required: true,
      immutable: true, // can be negative (stock reduction)
    },

    /** Admin who performed the change (audit trail requirement) */
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },

    /** Optional reason / notes for the change */
    reason: {
      type: String,
      trim: true,
      immutable: true,
      default: '',
    },

    timestamp: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    strict: true,
  }
);

// ── Immutability enforcement ──────────────────────────────────────────────────
function blockUpdates(next) {
  next(new Error('InventoryHistory is immutable: append-only audit log.'));
}

InventoryHistorySchema.pre('updateOne', blockUpdates);
InventoryHistorySchema.pre('updateMany', blockUpdates);
InventoryHistorySchema.pre('findOneAndUpdate', blockUpdates);
InventoryHistorySchema.pre('replaceOne', blockUpdates);

// ── Query indexes ─────────────────────────────────────────────────────────────
InventoryHistorySchema.index({ productId: 1, timestamp: -1 });
InventoryHistorySchema.index({ adminId: 1, timestamp: -1 });

module.exports = mongoose.model('InventoryHistory', InventoryHistorySchema);
