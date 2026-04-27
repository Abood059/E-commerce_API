const mongoose = require('mongoose');

const { Schema } = mongoose;
// Shared utilities are imported to standardize model patterns across the codebase.
require('./_shared');

/**
 * Inventory Collection (PDF requirements):
 * - 1:1 relationship with Product (unique productId)
 * - Multi-location inventory via locations[]
 * - Prevent negative stock at the database/schema level (availableQuantity >= 0)
 *
 * Note: The governance doc also requires atomic decrement/check logic during checkout.
 * That transactional enforcement is implemented at the service layer later, but the
 * schema still enforces a hard non-negative constraint to prevent invalid writes.
 */

const InventoryLocationSchema = new Schema(
  {
    locationName: { type: String, required: true, trim: true },

    /**
     * Non-negotiable stock integrity:
     * - Must never store negative values (PDF: Constraint >= 0).
     */
    availableQuantity: {
      type: Number,
      required: true,
      min: [0, 'availableQuantity cannot be negative.'],
    },

    status: {
      type: String,
      required: true,
      enum: ['Active', 'Low Stock', 'Out of Stock'],
      default: 'Active',
    },

    lastRestocked: { type: Date },
  },
  { _id: false }
);

const InventorySchema = new Schema(
  {
    /**
     * 1:1 relationship with Product:
     * - Enforced by unique index on productId.
     */
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
      index: true,
    },

    /**
     * Multi-warehouse support (PDF requirement).
     */
    locations: {
      type: [InventoryLocationSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Inventory must contain at least one location entry.',
      },
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Query optimization indexes:
 * - Quickly find low-stock or out-of-stock locations across products.
 */
InventorySchema.index({ 'locations.status': 1 });

module.exports = mongoose.model('Inventory', InventorySchema);
