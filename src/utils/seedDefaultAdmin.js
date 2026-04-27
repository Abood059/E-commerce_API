const User = require('../models/User');

/**
 * Default Admin Seeder (Task 1 – Default Manager Account)
 * ─────────────────────────────────────────────────────────────────────────
 * Automatically ensures a default admin account exists in the database on
 * every application startup.
 *
 * Behaviour:
 * - If NO admin user exists in the database → creates one using the
 *   DEFAULT_ADMIN_* variables from .env.
 * - If an admin already exists → skips silently (idempotent).
 * - Credentials are read from env vars, NEVER hardcoded here.
 * - Password is hashed by the User model's pre-save hook (bcrypt).
 *
 * Security notes:
 * - The plaintext password is never logged.
 * - In production, DEFAULT_ADMIN_PASSWORD should be replaced with a strong
 *   secret managed by a secrets manager (not committed to version control).
 *
 * @returns {Promise<void>}
 */
async function seedDefaultAdmin() {
  const {
    DEFAULT_ADMIN_NAME     = 'مدير النظام',
    DEFAULT_ADMIN_EMAIL    = 'admin@store.com',
    DEFAULT_ADMIN_PASSWORD,
  } = process.env;

  if (!DEFAULT_ADMIN_PASSWORD) {
    console.warn('[Seeder] DEFAULT_ADMIN_PASSWORD is not set in .env — skipping admin seed.');
    return;
  }

  try {
    // Check if any admin-role user already exists
    const existing = await User.findOne({ role: 'admin' });

    if (existing) {
      console.log(`[Seeder] Admin account already exists (${existing.email}) — skipping seed.`);
      return;
    }

    // Create the default admin
    await User.create({
      name:     DEFAULT_ADMIN_NAME,
      email:    DEFAULT_ADMIN_EMAIL.toLowerCase().trim(),
      password: DEFAULT_ADMIN_PASSWORD,
      role:     'admin',
    });

    console.log(`[Seeder] ✓ Default admin account created: ${DEFAULT_ADMIN_EMAIL}`);
    console.log('[Seeder]   → Remember to change the default password before going to production!');
  } catch (err) {
    if (err && err.code === 11000) {
      // Email duplicate — someone manually created this email already
      console.log('[Seeder] Admin email already registered — skipping seed.');
    } else {
      // Non-fatal: log warning but do NOT crash the server
      console.error('[Seeder] Failed to seed default admin:', err.message);
    }
  }
}

module.exports = { seedDefaultAdmin };
