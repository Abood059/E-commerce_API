const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

/**
 * User Model
 *
 * Identity + session anchor for the application:
 * - Stores credentials (hashed), role (RBAC), and profile preferences.
 * - Used by the JWT session layer: `auth.middleware.protect` attaches a user document
 *   to `req.user` after verifying the JWT stored in an HTTP-only cookie.
 *
 * Security constraints:
 * - Never persist or return plaintext passwords.
 * - Password is `select:false` so it is excluded from queries by default.
 */

const AddressSchema = new Schema(
  {
    city: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    building: { type: String, trim: true, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
      minlength: 8,
    },

    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
      index: true,
    },

    profile: {
      phoneNumber: { type: String, trim: true, default: '' },
      preferredLanguage: { type: String, enum: ['ar', 'en'], default: 'ar' },
    },

    /**
     * Addresses are stored for re-use, but Orders capture an immutable snapshot at purchase time
     * (legal compliance requirement from project docs).
     */
    addresses: {
      type: [AddressSchema],
      default: [],
      validate: {
        validator(addresses) {
          if (!Array.isArray(addresses)) return false;
          const defaults = addresses.filter((a) => a && a.isDefault).length;
          return defaults <= 1;
        },
        message: 'Only one address can be marked as default.',
      },
    },

    authMeta: {
      lastLogin: { type: Date },
      accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    },

    schemaVersion: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Pre-save password hashing:
 * - Hash only when password is modified to avoid re-hashing already hashed values.
 */
UserSchema.pre('save', async function hashPassword() {
  try {
    if (!this.isModified('password')) return ;
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    return ;
  } catch (err) {
    return err;
  }
});

/**
 * Compare a candidate password against the stored bcrypt hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
UserSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Query helper to explicitly exclude password (defense-in-depth).
 * Note: password is already `select:false`, but this helper keeps the call-site intent clear.
 */
UserSchema.query.withoutPassword = function withoutPassword() {
  return this.select('-password');
};

module.exports = mongoose.model('User', UserSchema);
