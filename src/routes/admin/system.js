const express = require('express');
const router = express.Router();

const { runReconciliation } = require('../../utils/reconciliation');

const AuditLog = require('../../models/AuditLog');

// Helper: async error wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/admin/audit-logs
 * Paginated audit log viewer. Filter by adminId or operation.
 */
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, adminId, operation } = req.query;
    const filter = {};
    if (adminId) filter.adminId = adminId;
    if (operation) filter.operation = operation;

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('adminId', 'name email')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  })
);

/**
 * GET /api/admin/reconcile
 * Run a data integrity check.
 */
router.get(
  '/reconcile',
  asyncHandler(async (req, res) => {
    const report = await runReconciliation({ fix: false });
    res.json({ success: true, report });
  })
);

/**
 * POST /api/admin/reconcile
 * Apply corrections to data integrity issues.
 */
router.post(
  '/reconcile',
  asyncHandler(async (req, res) => {
    const report = await runReconciliation({ fix: true });
    res.json({ success: true, report });
  })
);

module.exports = router;
