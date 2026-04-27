const checkoutService = require('../services/checkoutService');

/**
 * Checkout Controller
 * - Handles incoming requests for the checkout process.
 * - Extracts and validates user inputs, ensuring security and authorization.
 * - Relies on the checkoutService for the atomic database transaction.
 */

/**
 * Processes the cart checkout.
 * - Requires authentication (`req.user` must be populated via `protect` middleware).
 * - Accepts delivery location, address, and preferences from the request body.
 * - Prevents users from checking out carts belonging to others by forcing the `userId` from the authenticated token.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function processCheckout(req, res, next) {
  try {
    // 1. Ensure User is Authenticated (Fallback if middleware fails)
    if (!req.user || !req.user._id) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required to process checkout.' 
      });
    }

    const userId = req.user._id.toString();

    // 2. Extract and Sanitize Inputs
    const { 
      locationName, 
      addressInfo, 
      preferredLanguage = 'ar',
      currencyCode = 'USD'
    } = req.body;

    // Validate Required Fields
    if (!locationName || typeof locationName !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid locationName is required.' 
      });
    }

    if (!addressInfo || typeof addressInfo !== 'object' || !addressInfo.fullName || !addressInfo.addressLine1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid addressInfo object is required (must include fullName and addressLine1).' 
      });
    }

    // 3. Security: Do not accept financial logic from the client.
    // In a real production app, taxRate and exchangeRate would be fetched from 
    // a secure provider or database based on `addressInfo` and `currencyCode`.
    const taxRate = 0.15; // Hardcoded to 15% for the sake of the implementation
    const discount = 0;   // Hardcoded or dynamically fetched based on valid promo codes
    const exchangeRate = 1; // Fetched from FX service in real life

    // 4. Delegate to the atomic Checkout Service
    const order = await checkoutService.processCheckout({
      userId,
      locationName: locationName.trim(),
      addressInfo,
      preferredLanguage: preferredLanguage === 'en' ? 'en' : 'ar', // Strict sanitization
      taxRate,
      discount,
      currencyCode: currencyCode.trim(),
      exchangeRate
    });

    // 5. Return success response (hiding internal system data)
    return res.status(201).json({
      success: true,
      message: 'Checkout completed successfully.',
      data: {
        order: {
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          currencyCode: order.currencyCode,
          currentStatus: order.currentStatus,
          createdAt: order.createdAt
        }
      }
    });

  } catch (err) {
    // 6. Secure Error Handling: Do not leak database internals
    const statusCode = err && err.statusCode ? err.statusCode : 500;
    
    // Explicitly handle our known service errors
    if (statusCode === 400 || statusCode === 404 || statusCode === 409) {
      return res.status(statusCode).json({
        success: false,
        message: err.message,
        code: err.type || 'CHECKOUT_ERROR'
      });
    }

    // Unhandled exception fallback
    console.error(`[Checkout Controller] Unexpected error for user ${req.user._id}:`, err);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during checkout. Please try again later.'
    });
  }
}

module.exports = {
  processCheckout
};
