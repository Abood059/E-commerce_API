const { NODE_ENV } = process.env;

/**
 * Basic structured logger utility.
 */
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({ level: 'INFO', timestamp: new Date().toISOString(), message, ...meta }));
  },
  warn: (message, meta = {}) => {
    console.warn(JSON.stringify({ level: 'WARN', timestamp: new Date().toISOString(), message, ...meta }));
  },
  error: (message, error, meta = {}) => {
    const errorDetails = NODE_ENV === 'development' && error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : { message: error?.message };

    console.error(JSON.stringify({ 
      level: 'ERROR', 
      timestamp: new Date().toISOString(), 
      message, 
      error: errorDetails,
      ...meta 
    }));
  },
  
  /**
   * Log slow queries specifically.
   */
  slowQuery: (queryName, durationMs, details = {}) => {
    if (durationMs > 500) {
      logger.warn(`SLOW QUERY DETECTED: ${queryName} took ${durationMs}ms`, { queryName, durationMs, ...details });
    }
  }
};

module.exports = logger;
