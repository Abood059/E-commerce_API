const redis = require('redis');
const logger = require('../utils/logger');

// Retrieve Redis configuration from environment
const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';
const USE_REDIS = process.env.USE_REDIS !== 'false';

/**
 * ============================================================================
 * NO-OP CACHE SERVICE IMPLEMENTATIONS
 * ============================================================================
 * Used when Redis is disabled (USE_REDIS=false) or unavailable.
 * All operations complete silently without throwing errors or making network calls.
 */

const noOpCacheService = {
  redisClient: { isReady: false },
  
  connectRedis: async () => {
    // No operation - application proceeds without caching
  },

  /**
   * Returns null for all get operations (cache miss behavior).
   */
  getCached: async (key) => {
    return null;
  },

  /**
   * Silently accepts and discards all set operations.
   */
  setCached: async (key, value, ttlSeconds = 3600) => {
    // No operation - data is not persisted
  },

  /**
   * Silently accepts and discards all invalidation requests.
   */
  invalidateCache: async (pattern) => {
    // No operation - no keys to invalidate
  }
};

/**
 * ============================================================================
 * ACTIVE REDIS CACHE SERVICE IMPLEMENTATIONS
 * ============================================================================
 * Used when USE_REDIS=true and Redis is properly configured.
 * Implements full caching with TTL, pattern matching, and error handling.
 */

const activeRedisCacheService = {
  redisClient: redis.createClient({ url: REDIS_URI }),

  connectRedis: null, // Assigned after client setup
  getCached: null, // Assigned after client setup
  setCached: null, // Assigned after client setup
  invalidateCache: null // Assigned after client setup
};

// Setup active Redis client event listeners
activeRedisCacheService.redisClient.on('error', (err) => 
  logger.error('Redis Client Error', err)
);
activeRedisCacheService.redisClient.on('connect', () => 
  logger.info('Redis Client Connected')
);
activeRedisCacheService.redisClient.on('reconnecting', () => 
  logger.warn('Redis Client Reconnecting')
);

/**
 * Connects to Redis server. Logs errors but does not throw.
 */
activeRedisCacheService.connectRedis = async () => {
  try {
    await activeRedisCacheService.redisClient.connect();
  } catch (err) {
    logger.error('Failed to connect to Redis', err);
  }
};

/**
 * Gets a cached value and parses it from JSON.
 * Returns null on cache miss, Redis error, or if client is not ready.
 */
activeRedisCacheService.getCached = async (key) => {
  try {
    if (!activeRedisCacheService.redisClient.isReady) {
      return null;
    }
    const data = await activeRedisCacheService.redisClient.get(key);
    if (data) {
      logger.info(`Cache hit: ${key}`);
      return JSON.parse(data);
    }
    logger.info(`Cache miss: ${key}`);
    return null;
  } catch (err) {
    logger.error(`Redis Get Error for key ${key}`, err);
    return null; // Fail gracefully
  }
};

/**
 * Sets a cached value as JSON with a TTL (default 1 hour).
 * Silently fails if Redis client is not ready.
 */
activeRedisCacheService.setCached = async (key, value, ttlSeconds = 3600) => {
  try {
    if (!activeRedisCacheService.redisClient.isReady) {
      return;
    }
    await activeRedisCacheService.redisClient.setEx(
      key, 
      ttlSeconds, 
      JSON.stringify(value)
    );
  } catch (err) {
    logger.error(`Redis Set Error for key ${key}`, err);
  }
};

/**
 * Invalidates cache by exact key or pattern (if pattern includes *).
 * Note: Pattern matching can be slow in production with large datasets.
 * For true production scale, consider using Redis sets or explicit tag tracking.
 */
activeRedisCacheService.invalidateCache = async (pattern) => {
  try {
    if (!activeRedisCacheService.redisClient.isReady) {
      return;
    }
    if (pattern.includes('*')) {
      const keys = await activeRedisCacheService.redisClient.keys(pattern);
      if (keys.length > 0) {
        await activeRedisCacheService.redisClient.del(keys);
        logger.info(
          `Invalidated cache pattern: ${pattern}, removed ${keys.length} keys`
        );
      }
    } else {
      await activeRedisCacheService.redisClient.del(pattern);
      logger.info(`Invalidated cache key: ${pattern}`);
    }
  } catch (err) {
    logger.error(`Redis Invalidate Error for pattern ${pattern}`, err);
  }
};

/**
 * ============================================================================
 * CACHE SERVICE SELECTOR
 * ============================================================================
 * Exports the appropriate cache service based on USE_REDIS configuration.
 */

const cacheService = USE_REDIS ? activeRedisCacheService : noOpCacheService;

if (!USE_REDIS) {
  logger.info(
    'Redis is disabled via USE_REDIS=false. ' +
    'Using no-op cache service (all cache operations will be silently discarded).'
  );
}

module.exports = {
  redisClient: cacheService.redisClient,
  connectRedis: cacheService.connectRedis,
  getCached: cacheService.getCached,
  setCached: cacheService.setCached,
  invalidateCache: cacheService.invalidateCache
};
