import express from 'express';
import { upload, updatePassportData, uploadPassportPage } from '../controllers/passport';

const router = express.Router();

router.post('/upload', upload.single('passportPage'), uploadPassportPage);
router.post('/data', updatePassportData);

export default router;