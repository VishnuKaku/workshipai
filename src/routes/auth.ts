// server/src/routes/auth.ts
import express from 'express';
import { signup, login } from '../controllers/auth'; // Named imports for clarity

const router = express.Router();

// Routes
router.post('/signup', signup); // Directly pass the controller functions
router.post('/login', login);

export default router;