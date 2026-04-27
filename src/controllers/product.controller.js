const rateLimit = require('express-rate-limit');
const productService = require('../services/productService');
const { getCached, setCached } = require('../services/redisService');
const logger = require('../utils/logger');

/**
 * Rate Limiter: 100 requests per 15 minutes per IP.
 */
const productRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded for IP', { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  }
});

/**
 * Standardized Error Response Formatter
 */
const sendError = (res, statusCode, code, message, error = null) => {
  const response = { status: 'error', code, message };
  if (process.env.NODE_ENV === 'development' && error) {
    response.details = { name: error.name, stack: error.stack, message: error.message };
  }
  return res.status(statusCode).json(response);
};

/**
 * GET /api/v1/products
 */
const getProducts = async (req, res) => {
  try {
    // Validate request is already done via Joi middleware in routes
    const { page, limit, category, lang, currency } = req.query;
    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(limit) || 10;

    // Generate Cache Key based on fully qualified query
    const cacheKey = `products:p${parsedPage}:l${parsedLimit}:c${category || 'all'}:L${lang || 'en'}:C${currency || 'USD'}`;

    // 1. Check Redis Cache
    const cachedData = await getCached(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // 2. Fetch from DB via Service Aggregation Pipeline
    const { products, total } = await productService.getProductsList({
      page: parsedPage,
      limit: parsedLimit,
      category,
      lang: lang || 'en',
      currency: currency || 'USD'
    });

    if (!products || products.length === 0 && parsedPage === 1) {
       // If totally empty and on page 1, might return 404 per requirements if category was specified
       if (category) {
         return sendError(res, 404, 'CATEGORY_NOT_FOUND', 'Requested category does not exist or has no products.');
       }
    }

    // 3. Construct HATEOAS Response
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    
    // Build query string helper
    const buildQueryStr = (p) => {
      const q = new URLSearchParams(req.query);
      q.set('page', p);
      return `?${q.toString()}`;
    };

    const hasNext = (parsedPage * parsedLimit) < total;
    const hasPrev = parsedPage > 1;

    const responsePayload = {
      status: 'success',
      data: {
        products,
        pagination: {
          total,
          limit: parsedLimit,
          page: parsedPage,
          next: hasNext ? `${baseUrl}${buildQueryStr(parsedPage + 1)}` : null,
          prev: hasPrev ? `${baseUrl}${buildQueryStr(parsedPage - 1)}` : null,
        }
      }
    };

    // 4. Cache the Response
    await setCached(cacheKey, responsePayload, 3600); // 1 hour TTL

    // 5. Send Response
    return res.status(200).json(responsePayload);

  } catch (err) {
    logger.error('Error fetching products', err);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', err);
  }
};

module.exports = {
  getProducts,
  productRateLimiter,
  sendError
};
