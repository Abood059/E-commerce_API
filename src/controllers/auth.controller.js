const authService = require('../services/auth.service');

/**
 * Authentication Controller
 * - Orchestrates request/response responsibilities for auth endpoints:
 *   validation happens earlier, service handles business logic, controller sets cookies and shapes output.
 */

/**
 * Register controller:
 * - Creates user via auth service.
 * - Sets JWT cookie using setJwtCookie().
 * - Returns created user (password excluded).
 */
async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    const token = authService.generateToken(user._id.toString(), user.role);
    authService.setJwtCookie(res, token);
    
    // Ensure password is never returned in response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({ success: true, data: { user: userResponse } });
  } catch (err) {
   // console.error('Register error:', err && err.message ? err.message : err);
    //const status = err && err.statusCode ? err.statusCode : 400;
    //return res.status(status).json({ message: err.message || 'Registration failed.' });
    next(err);
  }
}

/**
 * Login controller:
 * - Authenticates via auth service.
 * - Returns the error `code` (not the raw internal message) so the frontend
 *   can display specific, user-friendly messages.
 * - Sets JWT cookie on success, returns user (password excluded).
 */
async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body.email, req.body.password);
    authService.setJwtCookie(res, token);

    // Ensure password is never returned in response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({ success: true, data: { user: userResponse, token } });
  } catch (err) {
    const status = err && err.statusCode ? err.statusCode : 401;
    // Include `code` so the UI can map it to a localised message
    return res.status(status).json({
      success: false,
      message: err.message || 'Login failed.',
      code:    err.code    || 'LOGIN_ERROR',
    });
  }
}

/**
 * Logout controller:
 * - Clears JWT cookie by setting empty value with maxAge: 0.
 */
function logout(req, res, next) {
  res.cookie('jwt', '', {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  return res.status(200).json({ message: 'Logged out successfully.' });
}

module.exports = {
  register,
  login,
  logout,
};

