const mongoose = require('mongoose');

const { Schema } = mongoose;
const { toDecimal128, validateNonNegative } = require('./_shared');

/**
 * Carts Collection (PDF requirements):
 * - Temporary per-user cart (1:1 with user).
 * - TTL cleanup via expiresAt index.
 *
 * Governance note (PDF):
 * - Price validation (double-check against Products) must occur on each fetch/checkout.
 *   That comparison is done in the service layer; this schema focuses on structure,
 *   TTL cleanup, and quantity integrity.
 */

const CartItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Cart item quantity must be at least 1.'],
    },

    /**
     * Pricing snapshot (requested):
     * - Captures the price as seen at the time of adding to cart.
     * - Final authoritative pricing still gets re-validated at checkout per governance docs.
     */
    priceSnapshot: {
      type: Schema.Types.Decimal128,
      required: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'priceSnapshot must be a non-negative Decimal128 value.',
      },
    },
    currencyCode: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const CartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    items: { type: [CartItemSchema], default: [] },

    /**
     * TTL session expiry (PDF requirement):
     * - Documents expire automatically when expiresAt is reached.
     * - expireAfterSeconds: 0 makes MongoDB expire exactly at the specified time.
     */
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * TTL Index for automatic cart cleanup.
 * This must be declared at the schema level to ensure it exists in production.
 */
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Cart', CartSchema);
