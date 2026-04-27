const mongoose = require('mongoose');

const { Schema } = mongoose;
const {
  toDecimal128,
  validateNonNegative,
  multilingualSubSchema,
  getLocalized,
} = require('./_shared');

/**
 * Products Collection (project docs):
 * - Multilingual title/description with Arabic fallback.
 * - Decimal128 for all monetary fields (financial integrity).
 * - Soft delete via isDeleted (relational integrity with historical orders).
 * - Schema versioning via schemaVersion (backward-compatible invoice reading).
 */

const ProductSchema = new Schema(
  {
    /**
     * Multilingual protocol (PDF requirement):
     * - Must be objects with structure { ar: String, en: String }.
     */
    title: { type: multilingualSubSchema, required: true },
    description: { type: multilingualSubSchema, required: true },

    /**
     * Category examples in PDF: "Mobiles", "Tablets", "Smart Home"
     */
    category: { type: String, required: true, trim: true, index: true },

    /**
     * Financial precision (non‑negotiable): Decimal128 for monetary values.
     */
    basePrice: {
      type: Schema.Types.Decimal128,
      required: true,
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'basePrice must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Currency code for the product's base price.
     * PDF default: 'USD'
     */
    currency: { type: String, default: 'USD', trim: true },

    images: [{ type: String, trim: true }],

    /**
     * PDF: specifications is an array of objects (technical data).
     * Use Mixed to stay flexible with product-specific attributes.
     */
    specifications: [{ type: Schema.Types.Mixed }],

    /**
     * PDF: averageRating is a decimal, updated when reviews are approved.
     * Stored as Decimal128 for consistency; if you later enforce 0..5, do it here.
     */
    averageRating: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0'),
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'averageRating must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Soft delete governance (PDF requirement):
     * - Never hard-delete products tied to historical orders; toggle this flag instead.
     */
    isDeleted: { type: Boolean, default: false, index: true },

    /**
     * Schema versioning governance (PDF requirement):
     * - Must exist in Products and Orders to support backward-compatible invoice reading.
     */
    schemaVersion: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Multilingual governance protocol (PDF requirement):
 * - Fallback mechanism: if requested language value is empty/null, fallback to Arabic.
 *
 * Returns a minimal display payload:
 * { title: string, description: string }
 */
ProductSchema.methods.getLocalized = function getLocalizedProduct(language) {
  return {
    title: getLocalized(this.title, language),
    description: getLocalized(this.description, language),
  };
};

/**
 * Query optimization indexes (best-practice):
 * - Common storefront queries filter by isDeleted + category.
 */
ProductSchema.index({ isDeleted: 1, category: 1 });


module.exports = mongoose.model('Product', ProductSchema);
