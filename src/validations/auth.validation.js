const Joi = require('joi');

/**
 * Joi validation schemas for the authentication lifecycle.
 * - `abortEarly:false` collects all field errors before responding.
 * - `.trim()` and `.lowercase()` enforce consistent sanitization.
 */

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required().messages({
    'string.base': 'name must be a string',
    'string.empty': 'name is required',
    'string.min': 'name must be at least 2 characters',
    'string.max': 'name must be at most 50 characters',
    'any.required': 'name is required',
  }),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required().messages({
    'string.base': 'email must be a string',
    'string.email': 'email must be a valid email',
    'string.empty': 'email is required',
    'any.required': 'email is required',
  }),
  password: Joi.string().min(8).required().messages({
    'string.base': 'password must be a string',
    'string.empty': 'password is required',
    'string.min': 'password must be at least 8 characters',
    'any.required': 'password is required',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required().messages({
    'string.base': 'email must be a string',
    'string.email': 'email must be a valid email',
    'string.empty': 'email is required',
    'any.required': 'email is required',
  }),
  password: Joi.string().min(8).required().messages({
    'string.base': 'password must be a string',
    'string.empty': 'password is required',
    'string.min': 'password must be at least 8 characters',
    'any.required': 'password is required',
  }),
});

const joiOptions = { abortEarly: false, stripUnknown: true };

module.exports = {
  registerSchema: registerSchema.options(joiOptions),
  loginSchema: loginSchema.options(joiOptions),
};

