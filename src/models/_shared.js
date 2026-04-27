const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Shared model utilities
 * - Centralizes Decimal128 conversion + validation (financial integrity).
 * - Centralizes multilingual { ar, en } sub-schema + localized getter (multilingual protocol).
 *
 * IMPORTANT:
 * - Keep this file dependency-free other than mongoose so all models can import it safely.
 */

/**
 * Convert any numeric-ish input into Decimal128.
 * - Accepts: Decimal128, number, numeric string.
 * - Leaves: null/undefined/'' untouched so required validators can handle missing values.
 * - Throws on obviously invalid numeric content to avoid persisting corrupt financial data.
 */
function toDecimal128(value) {
  if (value === null || value === undefined || value === '') return value;
  if (value instanceof mongoose.Types.Decimal128) return value;

  const asString = String(value).trim();
  if (!asString) return value;

  // Reject NaN/Infinity early to prevent storing invalid financial amounts.
  const asNumber = Number(asString);
  if (!Number.isFinite(asNumber)) {
    throw new Error(`Invalid Decimal128 value: ${asString}`);
  }

  return mongoose.Types.Decimal128.fromString(asString);
}

/**
 * Shared non-negative validator for Decimal128 monetary fields.
 * - Enforces financial integrity at schema level (no negative totals, taxes, discounts, etc.).
 */
function validateNonNegative(value) {
  if (value === null || value === undefined) return true;
  try {
    return Number(value.toString()) >= 0;
  } catch {
    return false;
  }
}

/**
 * Reusable multilingual sub-schema required by the project docs:
 * - Field structure must be exactly { ar: String, en: String }.
 */
const multilingualSubSchema = new Schema(
  {
    ar: { type: String, required: true, trim: true },
    en: { type: String, default: '', trim: true },
  },
  { _id: false }
);

/**
 * Retrieve the localized value for a multilingual field with Arabic fallback.
 * - If requested language is missing/empty, returns Arabic.
 * - If Arabic is also empty, returns '' (never null).
 */
function getLocalized(multilingualField, language) {
  const lang = (language || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';

  const requested = (multilingualField && multilingualField[lang]) || '';
  const requestedTrimmed = typeof requested === 'string' ? requested.trim() : '';
  if (requestedTrimmed) return requestedTrimmed;

  const fallback = (multilingualField && multilingualField.ar) || '';
  return typeof fallback === 'string' ? fallback.trim() : '';
}

module.exports = {
  toDecimal128,
  validateNonNegative,
  multilingualSubSchema,
  getLocalized,
};
