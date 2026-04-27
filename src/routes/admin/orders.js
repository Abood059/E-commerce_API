const express = require('express');
const router = express.Router();

const statsService = require('../../services/statsService');

const Order = require('../../models/Order');

// Helper: async error wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/admin/orders
 * Paginated orders list. Filter by status.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { currentStatus: status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('userId', 'name email')
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  })
);

/**
 * GET /api/admin/orders/:id
 * Single order detail with full status history timeline.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email profile')
      .lean();
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.json({ success: true, data: order });
  })
);

/**
 * PATCH /api/admin/orders/:id/status
 * Update order status. Appends to statusHistory.
 * Body: { status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Refunded' | 'Returned' }
 */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Returned', 'Paid'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        $set: { currentStatus: status },
        $push: { statusHistory: { status, timestamp: new Date(), adminId: req.user._id } },
      },
      { returnDocument: 'after', runValidators: false }
    ).lean();

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    // If order is marked Delivered, record in GlobalStats
    if (status === 'Delivered') {
      const amount = order.totalAmount
        ? parseFloat(order.totalAmount.toString())
        : 0;
      await statsService.recordOrderCompletion({
        orderId: order._id,
        orderAmount: amount,
        adminId: req.user._id.toString(),
      }).catch((e) => console.error('[Admin Route] Stats update failed:', e.message));
    }

    // If order is Refunded, record the refund
    if (status === 'Refunded') {
      const amount = order.totalAmount
        ? parseFloat(order.totalAmount.toString())
        : 0;
      await statsService.recordRefund({
        orderId: order._id,
        refundAmount: amount,
        adminId: req.user._id.toString(),
      }).catch((e) => console.error('[Admin Route] Refund stats update failed:', e.message));
    }

    res.json({ success: true, data: order });
  })
);

module.exports = router;
