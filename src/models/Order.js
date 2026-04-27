const mongoose = require('mongoose');

const { Schema } = mongoose;
const { toDecimal128, validateNonNegative } = require('./_shared');

/**
 * Orders Collection (PDF requirements):
 * - Most robust financial/legal record.
 * - Immutable snapshots of purchased items and delivery address.
 * - Multi-currency support: currency code + exchangeRate at execution time.
 * - Transaction language snapshot: purchasedInLanguage.
 * - Optimistic locking field: lockVersion (for payment-processing conflict prevention).
 * - Audit trail: adminId on status changes (statusHistory).
 */

// Financial integrity helpers are centralized in ./_shared.js (project docs requirement).

const OrderLineItemSchema = new Schema(
  {
    /**
     * originalProductID (PDF requirement):
     * - Preserves linkage to current product page while invoice remains independent.
     */
    originalProductID: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      immutable: true,
      index: true,
    },

    /**
     * Snapshot payload (PDF requirement):
     * - Must be stored inside the order to keep invoices independent from future product edits.
     */
    title: { type: String, required: true, trim: true, immutable: true },

    priceAtPurchase: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'priceAtPurchase must be a non-negative Decimal128 value.',
      },
    },

    tax: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'tax must be a non-negative Decimal128 value.',
      },
    },

    discount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'discount must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Immutable asset snapshot (PDF requirement):
     * - Must point to a durable/archived URL so old invoices never break if product media changes.
     */
    thumbnailUrl: { type: String, required: true, trim: true, immutable: true },

    /**
     * Partial returns support (PDF requirement):
     * - Each item can be returned independently.
     * - This is intentionally mutable because returns happen after purchase.
     */
    isReturned: { type: Boolean, default: false },

    /**
     * Quantity isn't explicitly listed in the first PDF excerpt, but is essential for invoices.
     * Stored immutable to preserve invoice integrity.
     */
    quantity: { type: Number, required: true, min: 1, immutable: true },
  },
  { _id: false }
);

/**
 * Address snapshot (PDF requirement):
 * - Captures full delivery address at purchase time.
 * - Immutable for legal compliance (invoice/history must not change).
 *
 * The PDFs do not enumerate sub-fields line-by-line in the extracted text, so we model a complete,
 * production-ready address shape while keeping it strict and explicit (no free-form Mixed).
 */
const AddressSnapshotSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, immutable: true },
    phone: { type: String, required: true, trim: true, immutable: true },

    country: { type: String, required: true, trim: true, immutable: true },
    city: { type: String, required: true, trim: true, immutable: true },
    area: { type: String, trim: true, immutable: true, default: '' },

    addressLine1: { type: String, required: true, trim: true, immutable: true },
    addressLine2: { type: String, trim: true, immutable: true, default: '' },
    building: { type: String, trim: true, immutable: true, default: '' },
    floor: { type: String, trim: true, immutable: true, default: '' },
    apartment: { type: String, trim: true, immutable: true, default: '' },
    postalCode: { type: String, trim: true, immutable: true, default: '' },
    notes: { type: String, trim: true, immutable: true, default: '' },
  },
  { _id: false, strict: true }
);

const StatusHistorySchema = new Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        'Pending',
        'Paid',
        'Processing',
        'Shipped',
        'Delivered',
        'Cancelled',
        'Refunded',
        'Returned',
      ],
      index: true,
    },
    timestamp: { type: Date, default: Date.now, required: true },

    /**
     * Audit trail requirement (PDF):
     * - Record admin identity on status modifications.
     * - Per your project clarification: admin is also a User.
     */
    adminId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true, trim: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /**
     * Language snapshot (PDF requirement):
     * - Persist the UI language at the moment of purchase for downstream notifications.
     */
    purchasedInLanguage: {
      type: String,
      required: true,
      enum: ['ar', 'en'],
      immutable: true,
      index: true,
    },

    /**
     * Snapshot arrays (PDF requirement):
     * - Must be immutable after order creation to ensure invoice independence.
     */
    lineItems: {
      type: [OrderLineItemSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Order must contain at least one line item.',
      },
    },

    /**
     * Financial totals (PDF requirement): Decimal128.
     * Immutable to protect invoices after creation.
     */
    totalAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'totalAmount must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Multi-currency support (PDF requirement):
     * - currencyCode and exchangeRate must be stored at execution time to avoid FX drift later.
     */
    currencyCode: { type: String, required: true, trim: true, immutable: true, index: true },
    exchangeRate: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'exchangeRate must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Address snapshot (PDF requirement): immutable.
     */
    addressSnapshot: { type: AddressSnapshotSchema, required: true, immutable: true },

    /**
     * Status tracking (PDF requirement):
     * - Full historical trace of state transitions.
     * - Current status is stored separately for efficient querying.
     */
    currentStatus: {
      type: String,
      required: true,
      enum: [
        'Pending',
        'Paid',
        'Processing',
        'Shipped',
        'Delivered',
        'Cancelled',
        'Refunded',
        'Returned',
      ],
      default: 'Pending',
      index: true,
    },
    statusHistory: { type: [StatusHistorySchema], default: [] },

    /**
     * Optimistic locking field (PDF requirement):
     * - Payment processing should match on lockVersion and $inc it atomically.
     * - This is separate from Mongoose's internal __v and is application-defined.
     */
    lockVersion: { type: Number, required: true, default: 0 },

    /**
     * Schema versioning governance (PDF requirement).
     */
    schemaVersion: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Legal compliance: hard-block update queries that try to mutate immutable snapshots.
 * - Mongoose `immutable` does not protect against update query operators.
 * - We allow updates only for operational fields (statusHistory, currentStatus, lockVersion, item returns).
 */
function assertNoSnapshotMutation(next) {
  const update = this.getUpdate() || {};
  const forbiddenTopLevel = new Set([
    'lineItems',
    'addressSnapshot',
    'totalAmount',
    'currencyCode',
    'exchangeRate',
    'purchasedInLanguage',
    'userId',
    'schemaVersion',
  ]);

  const touchesForbidden = (obj) =>
    obj &&
    Object.keys(obj).some((k) => forbiddenTopLevel.has(k) || k.startsWith('lineItems') || k.startsWith('addressSnapshot'));

  if (touchesForbidden(update)) {
    return next(new Error('Order snapshots are immutable: direct mutation is not allowed.'));
  }
  if (touchesForbidden(update.$set) || touchesForbidden(update.$unset) || touchesForbidden(update.$rename)) {
    return next(new Error('Order snapshots are immutable: update operators on snapshot fields are not allowed.'));
  }

  return next();
}

OrderSchema.pre('updateOne', assertNoSnapshotMutation);
OrderSchema.pre('updateMany', assertNoSnapshotMutation);
OrderSchema.pre('findOneAndUpdate', assertNoSnapshotMutation);
OrderSchema.pre('replaceOne', assertNoSnapshotMutation);

/**
 * Ensure statusHistory always includes the initial state for auditing.
 */
OrderSchema.pre('save', function ensureInitialStatusHistory(next) {
  if (this.isNew && (!Array.isArray(this.statusHistory) || this.statusHistory.length === 0)) {
    this.statusHistory = [{ status: this.currentStatus || 'Pending', timestamp: new Date() }];
  }
  next();
});

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ currentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Order', OrderSchema);
