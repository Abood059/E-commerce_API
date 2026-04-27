const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Generate a signed JWT access token for the session lifecycle.
 * - Payload includes user id + role for downstream authorization checks.
 * - Expiration is fixed at 30 minutes per requirements.
 *
 * @param {string} userId
 * @param {'customer'|'admin'} role
 * @returns {string} JWT token
 */
function generateToken(userId, role) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '30m' });
}

/**
 * Set the JWT into a secure HTTP-only cookie.
 * - httpOnly: prevents JS access (XSS mitigation)
 * - sameSite=Strict: prevents cross-site cookie sending (CSRF mitigation)
 * - secure: only over HTTPS in production
 *
 * @param {import('express').Response} res
 * @param {string} token
 */
function setJwtCookie(res, token) {
  res.cookie('jwt', token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000,
  });
}

/**
 * Register a new user identity record.
 * - Password hashing is handled by the User model pre-save hook.
 * - Returns the created user without the password field.
 *
 * @param {{name:string,email:string,password:string,role?:'customer'|'admin'}} userData
 * @returns {Promise<object>} created user document (password excluded)
 */
async function register(userData) {
  try {
    const created = await User.create(userData);
    // password is select:false, so it will not be present by default.
    return created;
  } catch (err) {
    if (err && err.code === 11000) {
      throw new Error('Email is already in use.');
    }
    throw err;
  }
}

/**
 * Authenticate a user and start a session.
 * - Validates existence, checks password, checks account status, updates lastLogin.
 * - Returns safe user data (no password) and a JWT access token.
 * - Throws errors with a `code` field so the controller can map them to
 *   user-friendly messages WITHOUT exposing internal detail to the client.
 *
 * Error codes (Task 2 – Specific Error Messages):
 *   USER_NOT_FOUND   → email doesn't match any account
 *   WRONG_PASSWORD   → email matched but password is wrong
 *   ACCOUNT_SUSPENDED → account is locked/suspended
 *   NOT_ADMIN        → authenticated but role is not admin
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object, token: string}>}
 */
async function login(email, password) {
  try {
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');

    if (!user) {
      const err = new Error('No account found with this email address.');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 401;
      throw err;
    }

    if (user.authMeta && user.authMeta.accountStatus === 'suspended') {
      const err = new Error('This account has been suspended. Please contact support.');
      err.code = 'ACCOUNT_SUSPENDED';
      err.statusCode = 403;
      throw err;
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      const err = new Error('Incorrect password. Please try again.');
      err.code = 'WRONG_PASSWORD';
      err.statusCode = 401;
      throw err;
    }

    // ── Unified Login Flow ──────────────────────────────────────────────────
    // We allow any user with an active account and correct credentials to log in.
    // Permissions/Roles are returned in the response for the client to handle UI logic.
    
    user.authMeta = user.authMeta || {};
    user.authMeta.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id.toString(), user.role);
    const safeUser = await User.findById(user._id).withoutPassword();

    return { user: safeUser, token };
  } catch (err) {
    // Log the error code only — never log the plaintext password
    console.error(`[Auth] Login failed [${err.code || 'UNKNOWN'}]:`, err.message);
    throw err;
  }
}

module.exports = {
  generateToken,
  setJwtCookie,
  register,
  login,
};

