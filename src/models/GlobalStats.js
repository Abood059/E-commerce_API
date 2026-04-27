const mongoose = require('mongoose');

const { Schema } = mongoose;
const { toDecimal128, validateNonNegative } = require('./_shared');

/**
 * Global Stats Collection (PDF requirements):
 * - Cumulative admin dashboard aggregates (event-driven).
 * - Must store totalSales (Decimal128), totalOrders (Number), and topProducts array.
 *
 * Governance note (PDF):
 * - Updates must be done using atomic operators ($inc) and ideally within the same
 *   transaction that creates the Order + StatsHistory log entry. That orchestration
 *   belongs to the service layer; this schema enforces types and indexability.
 */

// Financial integrity helpers are centralized in ./_shared.js (shared utilities pattern).

const TopProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    /**
     * Revenue contribution is monetary: Decimal128.
     */
    totalSales: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0'),
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'topProducts.totalSales must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Useful for ranking and reconciliation.
     */
    totalOrders: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
);

const GlobalStatsSchema = new Schema(
  {
    /**
     * Singleton pattern:
     * - Store a single document keyed by a constant to prevent multiple competing aggregates.
     */
    key: { type: String, required: true, default: 'GLOBAL', immutable: true },

    totalSales: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0'),
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'totalSales must be a non-negative Decimal128 value.',
      },
    },

    totalOrders: { type: Number, required: true, default: 0, min: 0 },

    /**
     * Requested aggregate:
     * - Track cumulative refunds separately for financial reconciliation.
     */
    totalRefunds: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0'),
      set: toDecimal128,
      validate: {
        validator: validateNonNegative,
        message: 'totalRefunds must be a non-negative Decimal128 value.',
      },
    },

    /**
     * Requested field:
     * - Application can set this on each stats update; we also default it for safety.
     */
    lastUpdated: { type: Date, default: Date.now, index: true },

    topProducts: { type: [TopProductSchema], default: [] },
  },
  {
    timestamps: true,
    strict: true,
  }
);

GlobalStatsSchema.index({ key: 1 }, { unique: true });
GlobalStatsSchema.index({ totalSales: -1 });

GlobalStatsSchema.pre('save', function touchLastUpdated(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('GlobalStats', GlobalStatsSchema);

