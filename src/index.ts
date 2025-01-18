import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import passportRoutes from './routes/passport';
import cors from 'cors';
import fs from 'fs';

// Load environment variables first
dotenv.config();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5000;

// Increase payload limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure CORS based on environment
const corsOrigin = process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGIN || '*'  // Use environment variable or allow all in production
    : 'http://localhost:3000';        // Default development origin

app.use(cors({
    origin: corsOrigin,
    credentials: true,
}));

// Handle Google Cloud credentials
async function setupGoogleCredentials() {
    try {
        if (process.env.GOOGLE_CREDENTIALS) {
            // If credentials are provided as JSON string in environment variable
            const credentialsPath = path.join(__dirname, './config/temp-credentials.json');
            fs.writeFileSync(credentialsPath, process.env.GOOGLE_CREDENTIALS);
            process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
            console.log('Google credentials configured from environment variable');
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // If credentials file path is provided
            if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                throw new Error(`Credentials file not found at: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
            }
            console.log('Google credentials configured from file path');
        } else {
            throw new Error('No Google credentials configuration found');
        }
    } catch (err) {
        console.error('Error configuring Google credentials:', err);
        process.exit(1);
    }
}

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is not defined in env");
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error("Could not connect to MongoDB:", err);
        process.exit(1);
    }
};

// Initialize application
async function initializeApp() {
    try {
        await setupGoogleCredentials();
        await connectDB();

        app.use('/api/auth', authRoutes);
        app.use('/api/passport', passportRoutes);

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Environment:', process.env.NODE_ENV || 'development');
        });
    } catch (err) {
        console.error('Failed to initialize application:', err);
        process.exit(1);
    }
}

initializeApp();

// Cleanup temporary credentials file on process exit
process.on('exit', () => {
    const tempCredentialsPath = path.join(__dirname, './config/temp-credentials.json');
    if (fs.existsSync(tempCredentialsPath)) {
        try {
            fs.unlinkSync(tempCredentialsPath);
        } catch (err) {
            console.error('Error cleaning up temporary credentials file:', err);
        }
    }
});

// Handle cleanup on unexpected termination
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());