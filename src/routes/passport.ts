import express from 'express';
import {
    upload,
    updatePassportData,
    uploadPassportPage,
    getPassportUserHistory,
    getPassportUserHistoryForMap,
    getUniqueStampImages,
} from '../controllers/passport';
import { authenticateUser } from '../middleware/authMiddleware'; // Import middleware


const router = express.Router();

router.post('/upload', authenticateUser, upload.single('passportPage'), uploadPassportPage);
router.post('/data', authenticateUser, updatePassportData);
router.get('/user-history', authenticateUser, getPassportUserHistory);  // New route
router.get('/user-history-map', authenticateUser, getPassportUserHistoryForMap); // New route for map data
router.get('/api/passport/unique-stamps', authenticateUser, getUniqueStampImages);

export default router;