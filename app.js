const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
let helmet;
try {
  helmet = require('helmet');
} catch (e) {
  helmet = null;
}

// 1. Load and validate environment variables
dotenv.config();

const requiredEnvVars = ['PORT', 'MONGODB_URI', 'JWT_SECRET', 'NODE_ENV'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1); // Prevent application from starting
}

const { PORT, MONGODB_URI, NODE_ENV, FRONTEND_URL } = process.env;

// 2. Initialize Express application
const app = express();

// 3. Verify folder structure before server starts listening
const requiredFolders = [
  'src/models',
  'src/services',
  'src/controllers',
  'src/middlewares',
  'src/validations',
  'src/routes'
];

console.log('Verifying folder structures...');
requiredFolders.forEach(folder => {
  const folderPath = path.join(__dirname, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Created missing folder: ${folder}`);
  } else {
    console.log(`Folder exists: ${folder}`);
  }
});

// 4. Middleware pipeline (strict order)
// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Basic security headers
if (helmet) {
  app.use(helmet());
} else {
  // Manual essential headers if helmet is not available
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
}

// CORS configuration based on NODE_ENV
const corsOptions = {
  origin: FRONTEND_URL || `http://localhost:${PORT}`,
  credentials: true, // Allow JWT cookie reading
};
app.use(cors(corsOptions));

// 5. Static file serving (Login/Register UI)
// Serving from the public folder
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  fs.mkdirSync(publicPath, { recursive: true });
}
app.use(express.static(publicPath));

// 6. Routing
try {
  // Authentication routes
  const authRoutes = require('./src/routes/auth.routes');
  app.use('/api/auth', authRoutes);
} catch (err) {
  console.warn('Warning: Could not load authRoutes.', err.message);
}

try {
  // Admin operations engine routes (requires JWT + admin role + audit logging)
  const adminRoutes = require('./src/routes/admin');
  app.use('/api/admin', adminRoutes);
} catch (err) {
  console.warn('Warning: Could not load adminRoutes.', err.message);
}

try {
  // Client v1 routes
  const v1Routes = require('./src/routes/v1.routes');
  app.use('/api/v1', v1Routes);
} catch (err) {
  console.warn('Warning: Could not load v1Routes.', err.message);
}



// SPA-style fallback: serve admin dashboard for /admin/* browser navigation
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard', 'pages', 'login.html'));
});
app.get('/admin/:page', (req, res) => {
  const page = req.params.page || 'login.html';
  const filePath = path.join(__dirname, 'public', 'admin-dashboard', 'pages', page);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Admin page not found.');
  }
});

// 7. Global error-handling middleware
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Return appropriate HTTP status codes based on error types
  if (err.name === 'ValidationError' || err.isJoi) {
    status = 400; // Validation errors
  } else if (err.name === 'UnauthorizedError' || status === 401) {
    status = 401; // Auth errors
  }

  // Prevent sensitive error details from leaking to clients in production
  if (NODE_ENV === 'production' && status === 500) {
    message = 'Internal Server Error';
  }

  res.status(status).json({
    success: false,
    code: err.code || 'SERVER_ERROR',
    message,
    stack: NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 8. MongoDB connection and Server Startup
const { seedDefaultAdmin } = require('./src/utils/seedDefaultAdmin');
const { connectRedis } = require('./src/services/redisService');

const startServer = async () => {
  let retries = 3;
  while (retries > 0) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('Database Connected');
      connectRedis(); // Do not await to avoid blocking if Redis is down

      // Task 1: Seed default admin account (idempotent – skips if already exists)
      await seedDefaultAdmin();

      break;
    } catch (error) {
      retries -= 1;
      console.error(`Database connection error. Details: ${error.message}`);
      if (retries === 0) {
        console.error('ERROR: Failed to connect to database after 3 attempts. App will not start.');
        process.exit(1);
      }
      console.log(`Retrying connection... (${retries} retries left)`);
      // Wait 2 seconds before retrying
      await new Promise(res => setTimeout(res, 2000));
    }
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
    console.log('All systems are ready for testing.');
  });
};

startServer();
