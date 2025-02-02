import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import passportRoutes from './routes/passport';
import cors from 'cors';
import fs from 'fs';

// Load environment variables first
/*const dotenvResult = dotenv.config({ path: './.env' });
if (dotenvResult.error) {
  console.error('Error loading env variables', dotenvResult.error);
  throw new Error('Failed to load env variable from .env');
}
console.log('Env variables loaded successfully');*/

const app = express();
const PORT = process.env.PORT || 5000;

// Add health check endpoint for App Runner
app.get('/health', (req, res) => {
  res.status(200).send('healthy');
});

// Create uploads and uploads/stamps directories if they don't exist
const uploadsDir = path.join(__dirname, '../uploads');
const stampsDir = path.join(uploadsDir, 'stamps');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(stampsDir)) {
  fs.mkdirSync(stampsDir, { recursive: true });
}
console.log('Upload directories initialized');

// Ensure config directory exists
const configDir = path.join(__dirname, 'config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Increase payload limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure CORS with multiple origins
const allowedOrigins = [
  'http://localhost:3000', // Local development
  'http://test17jan.s3-website-us-east-1.amazonaws.com', // S3 website
  'https://test17jan.s3-website-us-east-1.amazonaws.com', // S3 website HTTPS
  process.env.CORS_ORIGIN, // Any additional origin from env
].filter(Boolean); // Remove undefined/null values

// Add CORS pre-flight
app.options('*', cors());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some(allowedOrigin =>
      allowedOrigin && (origin === allowedOrigin || origin.endsWith(allowedOrigin.replace('http://', '.').replace('https://', '.')))
    );

    if (isAllowed || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.log(`Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
  next();
});

// Serve static files from uploads and uploads/stamps directories
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads/stamps', express.static(stampsDir));

// Enhanced Google Cloud credentials setup
async function setupGoogleCredentials() {
  try {
    // Check if running in App Runner (production) environment
    const isProduction = process.env.NODE_ENV === 'production';
    let credentialsPath;

    if (process.env.GOOGLE_CREDENTIALS) {
      // In App Runner, write to /tmp directory
      // In local development, write to config directory
      credentialsPath = isProduction
        ? path.join('/tmp', 'google-credentials.json')
        : path.join(__dirname, 'config', 'temp-credentials.json');

      // Create directory if it doesn't exist (for local development)
      if (!isProduction) {
        const configDir = path.dirname(credentialsPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
      }

      // Write credentials to file
      fs.writeFileSync(credentialsPath, process.env.GOOGLE_CREDENTIALS);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
      console.log(`Google credentials configured from environment variable at: ${credentialsPath}`);
      return;
    }

    // For local development, check for credentials file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        console.log('Google credentials configured from local file');
        return;
      }
      throw new Error(`Credentials file not found at: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    }

    throw new Error('No Google credentials configuration found');
  } catch (err) {
    console.error('Error configuring Google credentials:', err);
    // Don't exit process, let App Runner retry
    throw err;
  }
}

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in env');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('Could not connect to MongoDB:', err);
    // Don't exit process, let App Runner retry
    throw err;
  }
};

// Initialize application
async function initializeApp() {
  let retries = 5;
  while (retries > 0) {
    try {
      await setupGoogleCredentials();
      await connectDB();

      app.use('/api/auth', authRoutes);
      app.use('/api/passport', passportRoutes);

      // Error handling middleware
      app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
      });

      // Serve the built React app for any non-API routes
      const buildPath = path.join(__dirname, '../passport-app-frontend/build');
      app.use(express.static(buildPath));

      // Send index.html for all other requests
      app.get('*', (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
      });

      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Environment:', process.env.NODE_ENV || 'development');
        console.log('Allowed Origins:', allowedOrigins);
      });

      return; // Success, exit the retry loop
    } catch (err) {
      retries--;
      console.error(`Failed to initialize application. Retries left: ${retries}`, err);
      if (retries === 0) {
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }
      // Wait for 5 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

initializeApp();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Starting graceful shutdown...');
  try {
    // Clean up temporary credentials
    const tempCredentialsPath = path.join(__dirname, 'config', 'temp-credentials.json');
    if (fs.existsSync(tempCredentialsPath)) {
      fs.unlinkSync(tempCredentialsPath);
    }

    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received');
  process.emit('SIGTERM');
});