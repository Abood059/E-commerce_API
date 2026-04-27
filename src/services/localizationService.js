const { getLocalizedText, localizeDocument } = require('../utils/fallbackLocalization');

/**
 * Localization Service (Priority 2 – Global Localization Engine)
 * ─────────────────────────────────────────────────────────────────────────
 * Thin service layer that exposes localization utilities to controllers
 * and other services. Centralizes the language resolution so that API
 * response formatters never directly import from utils/.
 *
 * Re-exports from utils/fallbackLocalization for clean import paths.
 * Additional helpers for common document types (products, categories) are
 * built here to avoid duplicating field lists across the codebase.
 */

/**
 * Multilingual fields present on Product documents.
 * Add here if more multilingual fields are added to the Product schema.
 */
const PRODUCT_MULTILINGUAL_FIELDS = ['title', 'description'];

/**
 * Localize a single product document for API response.
 *
 * @param {object} product - Raw product document (Mongoose doc or plain object)
 * @param {string} lang    - Target language ('ar' | 'en')
 * @returns {object}
 */
function localizeProduct(product, lang) {
  return localizeDocument(product, lang, PRODUCT_MULTILINGUAL_FIELDS);
}

/**
 * Localize an array of product documents.
 *
 * @param {object[]} products
 * @param {string}   lang
 * @returns {object[]}
 */
function localizeProducts(products, lang) {
  return products.map((p) => localizeProduct(p, lang));
}

/**
 * Detect preferred language from HTTP request.
 * Priority: query param ?lang= → Accept-Language header → default 'ar'.
 *
 * @param {import('express').Request} req
 * @returns {'ar' | 'en'}
 */
function detectLanguage(req) {
  const queryLang = req.query && req.query.lang;
  if (queryLang === 'ar' || queryLang === 'en') return queryLang;

  const headerLang = req.headers && req.headers['accept-language'];
  if (headerLang && headerLang.toLowerCase().startsWith('en')) return 'en';

  return 'ar'; // Default: Arabic (per project PDF)
}

module.exports = {
  getLocalizedText,
  localizeDocument,
  localizeProduct,
  localizeProducts,
  detectLanguage,
};
