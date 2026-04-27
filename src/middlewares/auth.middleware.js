const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware:
 * - Extracts JWT from HTTP-only cookie `req.cookies.jwt`.
 * - Verifies token signature/expiry using JWT_SECRET.
 * - Attaches the authenticated user to `req.user` (password excluded by default).
 *
 * Error cases:
 * - Missing token => 401
 * - Expired token => 401 "Token expired"
 * - Invalid token => 401 "Invalid token"
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function protect(req, res, next) {
  try {
    const token = req.cookies && req.cookies.jwt;
    if (!token) {
      return res.status(401).json({ message: 'Not authenticated: no token provided.' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured.');
      return res.status(401).json({ message: 'Authentication misconfigured.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await User.findById(decoded.id).withoutPassword();
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    if (user.authMeta && user.authMeta.accountStatus === 'suspended') {
      return res.status(401).json({ message: 'Account is suspended.' });
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error('Auth protect error:', err && err.message ? err.message : err);
    return res.status(401).json({ message: 'Authentication failed.' });
  }
}

/**
 * Restrict-to middleware factory:
 * - Enforces role-based access control after `protect`.
 *
 * @param  {...('customer'|'admin')} roles
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => any}
 */
function restrictTo(...roles) {
  return function restrictToRoles(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Forbidden: requires role ${roles.join(' or ')}.` });
    }
    return next();
  };
}

module.exports = {
  protect,
  restrictTo,
};

