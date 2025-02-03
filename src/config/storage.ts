import express from 'express';
import path from 'path';
import fs from 'fs';

// File storage configuration
const getStorageConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // Use /tmp in production (AWS App Runner)
    return {
      baseDir: '/tmp',
      uploadsDir: '/tmp/uploads',
      stampsDir: '/tmp/uploads/stamps',
      // Use absolute URLs in production
      publicPath: '/uploads'
    };
  } else {
    // Use local paths in development
    return {
      baseDir: path.join(__dirname, '..'),
      uploadsDir: path.join(__dirname, '../uploads'),
      stampsDir: path.join(__dirname, '../uploads/stamps'),
      // Use relative URLs in development
      publicPath: '/uploads'
    };
  }
};

// Initialize storage directories
const initializeStorage = () => {
  const config = getStorageConfig();
  
  console.log('Initializing storage directories:', {
    environment: process.env.NODE_ENV,
    config
  });

  // Create directories if they don't exist
  [config.uploadsDir, config.stampsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });

  // Configure static file serving
  const app = express();
  
  // Serve from both production and development paths
  app.use('/uploads', express.static(config.uploadsDir));
  if (process.env.NODE_ENV === 'production') {
    // In production, also serve from /tmp
    app.use('/uploads', express.static('/tmp/uploads'));
  }

  // Add middleware to handle file paths
  app.use((req, res, next) => {
    // Attach storage config to request for use in routes
    (req as any).storageConfig = config;
    next();
  });

  return config;
};

// Add storage health check endpoint
const addStorageHealthCheck = (app: express.Application) => {
  app.get('/api/health/storage', (req, res) => {
    const config = getStorageConfig();
    try {
      // Check if directories exist and are writable
      const health = {
        uploadsDir: {
          exists: fs.existsSync(config.uploadsDir),
          writable: false
        },
        stampsDir: {
          exists: fs.existsSync(config.stampsDir),
          writable: false
        }
      };

      // Check write permissions
      try {
        fs.accessSync(config.uploadsDir, fs.constants.W_OK);
        health.uploadsDir.writable = true;
      } catch (e) {
        health.uploadsDir.writable = false;
      }

      try {
        fs.accessSync(config.stampsDir, fs.constants.W_OK);
        health.stampsDir.writable = true;
      } catch (e) {
        health.stampsDir.writable = false;
      }

      res.json({
        status: 'healthy',
        environment: process.env.NODE_ENV,
        config,
        health
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: (error instanceof Error) ? error.message : 'Unknown error',
        config
      });
    }
  });
};

export { getStorageConfig, initializeStorage, addStorageHealthCheck };