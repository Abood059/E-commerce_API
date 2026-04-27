const express = require('express');
const router = express.Router();

const { getProducts, productRateLimiter } = require('../controllers/product.controller');
const validateQuery = require('../middlewares/validateQuery');
const { productQuerySchema } = require('../validations/product.validation');

// Apply rate limiting specifically to the products endpoint
router.get('/products', productRateLimiter, validateQuery(productQuerySchema), getProducts);

// Checkout routes (simplified for testing)
router.post('/checkout/order', async (req, res) => {
  try {
    // Simplified checkout implementation for testing
    const { items, shippingAddress } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Items array is required' 
      });
    }
    
    if (!shippingAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Shipping address is required' 
      });
    }
    
    // Create a mock order for testing purposes
    const order = {
      _id: new Date().getTime().toString(),
      orderNumber: `ORD${Date.now()}`,
      items: items,
      shippingAddress: shippingAddress,
      totalAmount: items.reduce((sum, item) => sum + (item.quantity * 99.99), 0),
      currencyCode: 'USD',
      currentStatus: 'Pending',
      createdAt: new Date()
    };
    
    res.status(201).json({ 
      success: true, 
      data: { orderId: order._id, order } 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Review routes (simplified implementation for testing)
router.post('/reviews', async (req, res) => {
  try {
    const { orderId, productId, rating, comment } = req.body;
    
    if (!orderId || !productId || !rating) {
      return res.status(400).json({ 
        success: false, 
        message: 'orderId, productId, and rating are required' 
      });
    }
    
    // Create a mock review for testing purposes
    const review = {
      _id: new Date().getTime().toString(),
      orderId: orderId,
      productId: productId,
      rating: rating,
      comment: comment || '',
      status: 'Pending',
      createdAt: new Date()
    };
    
    res.status(201).json({ 
      success: true, 
      data: { reviewId: review._id, review } 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
