import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { User as UserInterface } from '../models/User';

// Extend the Express Request type to include the user property
declare global {
    namespace Express {
        interface Request {
            user?: Omit<UserInterface, 'password'>; // Type-safe user property
        }
    }
}


export const authenticateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.header('Authorization');

    // Ensure the Authorization header is properly formatted
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ message: 'Access denied. Token missing or improperly formatted.' });
        return;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        // Decode the JWT
        const decoded = jwt.verify(token, getJwtSecret()) as { id: string };

        // Find the user in the database
        const user = await User.findById(decoded.id).select('-password -__v');
        if (!user) {
            res.status(401).json({ message: 'User not found. Invalid token.' });
            return;
        }

        // Attach the user object to the request
        req.user = user;
        next();
    } catch (error) {
        console.error('JWT Error:', error);
        res.status(400).json({ message: 'Invalid or expired token.' });
    }
};

function getJwtSecret(): string {
    const JWT_SECRET = process.env.JWT_SECRET;
     if(!JWT_SECRET){
      throw new Error("JWT_SECRET variable not found.");
    }
    return JWT_SECRET;
}