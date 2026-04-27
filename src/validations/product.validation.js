const Joi = require('joi');

/**
 * Validation schema for product listing query parameters.
 */
const productQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'page must be a number',
    'number.min': 'page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    'number.base': 'limit must be a number',
    'number.min': 'limit must be at least 1',
    'number.max': 'limit cannot exceed 100',
  }),
  category: Joi.string().trim().messages({
    'string.base': 'category must be a string',
  }),
  lang: Joi.string().valid('ar', 'en').default('en').messages({
    'any.only': 'lang must be one of [ar, en]',
  }),
  currency: Joi.string().trim().uppercase().length(3).default('USD').messages({
    'string.base': 'currency must be a string',
    'string.length': 'currency must be exactly 3 characters (e.g., USD, SAR)',
  })
});

const joiOptions = { abortEarly: false, stripUnknown: true };

module.exports = {
  productQuerySchema: productQuerySchema.options(joiOptions)
};
