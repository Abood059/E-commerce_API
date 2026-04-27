const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * AuditLogs Collection
 * ─────────────────────────────────────────────
 * Immutable, append-only record of every admin state-changing operation.
 *
 * Governance protocol:
 * - All POST / PUT / PATCH / DELETE requests from an authenticated admin
 *   are captured BEFORE the route handler executes (via auditLogger middleware).
 * - Records MUST NOT be updated or deleted (enforced below via pre-hooks).
 * - adminId is required; any mutation without an authenticated admin is rejected
 *   at the middleware layer, not here.
 *
 * Fields align with the audit requirements defined in the project PDF documents:
 *   adminId, operation, endpoint, payload, timestamp.
 */
const AuditLogSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },

    /** HTTP method: POST | PUT | PATCH | DELETE */
    operation: {
      type: String,
      required: true,
      immutable: true,
      enum: ['POST', 'PUT', 'PATCH', 'DELETE'],
      index: true,
    },

    /** Full request path, e.g. /api/admin/products/123 */
    endpoint: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    /**
     * Request body snapshot (Mixed to support any payload shape).
     * Sensitive fields (passwords, tokens) are stripped at middleware level.
     */
    payload: {
      type: Schema.Types.Mixed,
      immutable: true,
      default: {},
    },

    /** ISO timestamp of when the action was captured */
    timestamp: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We manage timestamp ourselves for immutability clarity
    strict: true,
  }
);

// ── Immutability enforcement ──────────────────────────────────────────────────
function blockAuditUpdates(next) {
  next(new Error('AuditLog is immutable: updates/deletes are not permitted.'));
}

AuditLogSchema.pre('updateOne', blockAuditUpdates);
AuditLogSchema.pre('updateMany', blockAuditUpdates);
AuditLogSchema.pre('findOneAndUpdate', blockAuditUpdates);
AuditLogSchema.pre('replaceOne', blockAuditUpdates);
AuditLogSchema.pre('deleteOne', blockAuditUpdates);
AuditLogSchema.pre('deleteMany', blockAuditUpdates);
AuditLogSchema.pre('findOneAndDelete', blockAuditUpdates);

// ── Query indexes ─────────────────────────────────────────────────────────────
AuditLogSchema.index({ adminId: 1, timestamp: -1 });
AuditLogSchema.index({ operation: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
