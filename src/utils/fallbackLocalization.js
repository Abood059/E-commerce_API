/**
 * Fallback Localization Utility (Priority 2 – Global Localization Engine)
 * ─────────────────────────────────────────────────────────────────────────
 * Central helper that enforces the multilingual protocol defined in the project PDF.
 *
 * Protocol rules (non-negotiable):
 * 1. Return the value for the requested language if it exists and is non-empty.
 * 2. If the requested value is null / undefined / empty string → fall back to Arabic ('ar').
 * 3. If both are missing → return null (caller decides on placeholder display).
 *
 * This function is the single source of truth for all text retrieval operations
 * across services, controllers, and API response formatters.
 *
 * @param {{ ar?: string; en?: string } | null | undefined} translationObj
 * @param {'ar' | 'en' | string} requestedLang
 * @returns {string | null}
 *
 * @example
 * const title = getLocalizedText({ ar: 'هاتف ذكي', en: 'Smartphone' }, 'en');
 * // → 'Smartphone'
 *
 * @example
 * const title = getLocalizedText({ ar: 'هاتف ذكي', en: '' }, 'en');
 * // → 'هاتف ذكي'  (Arabic fallback)
 *
 * @example
 * const title = getLocalizedText(null, 'ar');
 * // → null  (both missing)
 */
function getLocalizedText(translationObj, requestedLang) {
  if (!translationObj || typeof translationObj !== 'object') {
    return null;
  }

  const lang = typeof requestedLang === 'string' ? requestedLang.toLowerCase().trim() : 'ar';

  // Step 1: Try requested language
  const requestedValue = translationObj[lang];
  if (requestedValue && typeof requestedValue === 'string' && requestedValue.trim().length > 0) {
    return requestedValue.trim();
  }

  // Step 2: Fall back to Arabic
  const arabicValue = translationObj['ar'];
  if (arabicValue && typeof arabicValue === 'string' && arabicValue.trim().length > 0) {
    return arabicValue.trim();
  }

  // Step 3: Both missing
  return null;
}

/**
 * Localize an entire product/document that contains multilingual fields.
 * Converts { ar, en } objects into flat strings for the requested language.
 *
 * @param {object} doc  - Raw document with multilingual fields
 * @param {string} lang - Target language code ('ar' | 'en')
 * @param {string[]} fields - Field names to localize (must be { ar, en } objects)
 * @returns {object} New object with localized string values
 *
 * @example
 * localizeDocument(product, 'en', ['title', 'description'])
 */
function localizeDocument(doc, lang, fields = []) {
  if (!doc || typeof doc !== 'object') return doc;

  const result = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };

  fields.forEach((field) => {
    if (result[field] && typeof result[field] === 'object') {
      result[field] = getLocalizedText(result[field], lang) ?? '';
    }
  });

  return result;
}

module.exports = {
  getLocalizedText,
  localizeDocument,
};
