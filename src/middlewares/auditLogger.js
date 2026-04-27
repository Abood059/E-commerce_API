const AuditLog = require('../models/AuditLog');

/**
 * Admin Action Logger Middleware (Priority 1 – Audit & Protection Engine)
 * ─────────────────────────────────────────────────────────────────────────
 * Automatically intercepts all state-changing HTTP methods (POST, PUT, PATCH, DELETE)
 * on admin routes and persists an immutable record to the AuditLogs collection
 * BEFORE the route handler executes.
 *
 * Placement in the pipeline:
 *   app.use('/api/admin', protect, restrictTo('admin'), auditLogger, adminRouter);
 *
 * Design decisions:
 * - Fire-and-forget pattern with await: the log is written before next() so that
 *   failed audit writes abort the operation (compliance requirement).
 * - Sensitive fields (password, token, secret) are stripped from the payload snapshot.
 * - adminId is read from req.user (populated by auth.middleware.protect).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */

/** Fields that must never appear in audit log payloads */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordConfirm',
  'token',
  'secret',
  'accessToken',
  'refreshToken',
  'jwt',
  'apiKey',
  'creditCard',
  'cvv',
]);

/**
 * Recursively strip sensitive keys from an object.
 * Returns a new object; does not mutate the original.
 *
 * @param {*} obj
 * @returns {*}
 */
function sanitizePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);

  return Object.keys(obj).reduce((acc, key) => {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      acc[key] = '[REDACTED]';
    } else {
      acc[key] = sanitizePayload(obj[key]);
    }
    return acc;
  }, {});
}

const AUDITABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function auditLogger(req, res, next) {
  // Only audit state-changing operations
  if (!AUDITABLE_METHODS.has(req.method)) {
    return next();
  }

  // req.user must be set by protect middleware before this runs
  if (!req.user || !req.user._id) {
    // This should never happen if middleware order is correct; fail loudly.
    return res.status(401).json({
      message: 'Audit logger: unauthenticated admin request – operation blocked.',
    });
  }

  try {
    await AuditLog.create({
      adminId: req.user._id,
      operation: req.method,
      endpoint: req.originalUrl || req.url,
      payload: sanitizePayload(req.body),
      timestamp: new Date(),
    });

    return next();
  } catch (auditError) {
    // Audit failure is a critical governance error – do NOT allow the operation to proceed.
    console.error('[AuditLogger] Failed to write audit log:', auditError.message);
    return res.status(500).json({
      message: 'Audit logging failed. Operation aborted for compliance reasons.',
    });
  }
}

module.exports = auditLogger;
