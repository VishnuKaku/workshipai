import express from 'express';
import {
    upload,
    updatePassportData,
    uploadPassportPage,
    getPassportUserHistory,
    getPassportUserHistoryForMap,
    getUniqueStampImages,
    getWordCloudData, // Add this import
} from '../controllers/passport';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Keep existing routes
router.post('/upload', authenticateUser, upload.single('passportPage'), uploadPassportPage);
router.post('/data', authenticateUser, updatePassportData);
router.get('/user-history', authenticateUser, getPassportUserHistory);
router.get('/user-history-map', authenticateUser, getPassportUserHistoryForMap);
router.get('/unique-stamps', authenticateUser, getUniqueStampImages);

// Add new word cloud route
router.get('/word-cloud', authenticateUser, getWordCloudData);

export default router;