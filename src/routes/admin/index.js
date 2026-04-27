const express = require('express');
const router = express.Router();

const { protect, restrictTo } = require('../middlewares/auth.middleware');
const auditLogger = require('../middlewares/auditLogger');

// Import modular route files
const dashboardRoutes = require('./dashboard');
const productRoutes = require('./products');
const inventoryRoutes = require('./inventory');
const orderRoutes = require('./orders');
const reviewRoutes = require('./reviews');
const systemRoutes = require('./system');

/**
 * Admin Router
 * ─────────────────────────────────────────────────────────────────────────
 * All routes here require:
 *   1. protect       – validates JWT, attaches req.user
 *   2. restrictTo('admin') – enforces RBAC
 *   3. auditLogger   – immutably logs all state-changing requests
 *
 * Mounted at: /api/admin
 *
 * Route handlers are intentionally thin – they validate input,
 * orchestrate service calls, and shape the HTTP response.
 * All business logic lives in src/services/.
 */

// Apply auth + audit middleware to the entire admin router
router.use(protect, restrictTo('admin'), auditLogger);

// Mount modular routes
router.use('/dashboard', dashboardRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/orders', orderRoutes);
router.use('/reviews', reviewRoutes);
router.use('/', systemRoutes); // system routes include audit-logs and reconcile

module.exports = router;
