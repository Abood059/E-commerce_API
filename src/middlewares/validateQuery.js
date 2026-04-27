/**
 * Query validation middleware factory.
 *
 * Validates `req.query` against a Joi schema.
 * - On failure: responds 400 with a structured array of field-level messages.
 * - On success: replaces `req.query` with the validated/sanitized value.
 *
 * @param {import('joi').Schema} schema
 * @returns {import('express').RequestHandler}
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query);

    if (error) {
      const errors = (error.details || []).map((d) => ({
        field: Array.isArray(d.path) && d.path.length ? d.path.join('.') : 'query',
        message: d.message.replace(/\"/g, ''),
      }));

      return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'Validation failed', errors });
    }

    req.query = value;
    return next();
  };
}

module.exports = validateQuery;
