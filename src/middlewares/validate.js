/**
 * Global validation middleware factory.
 *
 * Validates `req.body` against a Joi schema.
 * - On failure: responds 400 with a structured array of field-level messages.
 * - On success: replaces `req.body` with the validated/sanitized value.
 *
 * @param {import('joi').Schema} schema
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);

    if (error) {
      const errors = (error.details || []).map((d) => ({
        field: Array.isArray(d.path) && d.path.length ? d.path.join('.') : 'body',
        message: d.message.replace(/\"/g, ''),
      }));

      return res.status(400).json({ message: 'Validation failed', errors });
    }

    req.body = value;
    return next();
  };
}

module.exports = validate;

