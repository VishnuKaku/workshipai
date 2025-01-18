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

// Set Google credentials path
const googleCredentialsPath = path.join(__dirname, './config/google-cloud-credentials.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = googleCredentialsPath;

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

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
}));

// Verify Google credentials exist
try {
    if (!fs.existsSync(googleCredentialsPath)) {
        console.error('Google credentials file not found at:', googleCredentialsPath);
        console.error('Please ensure you have placed your google-cloud-credentials.json in the config directory');
        process.exit(1);
    }
} catch (err) {
    console.error('Error checking Google credentials:', err);
    process.exit(1);
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

connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/passport', passportRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Google credentials path:', googleCredentialsPath);
});