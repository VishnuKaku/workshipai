// server/src/controllers/auth.ts
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User';

// Load JWT secret from environment variables, or use a default secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use environment variables in production

// Handler for user signup
const signup = async (req: Request, res: Response): Promise<void> => {
  try {
        const { username, password } = req.body;
    
        // Check if the username or password was provided
        if(!username || !password){
            res.status(400).json({message: 'Please provide username and password'})
            return;
        }

    // Check if the user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      res.status(400).json({ message: 'Username already exists' });
      return;
    }

    // Hash the password before saving it
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user document
    const newUser = new User({ username, password: hashedPassword });

    // Save the new user to the database
    await newUser.save();

    // Generate a JWT token for the newly registered user
    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '1h' });
    
    // Respond with a success status, the generated token, and message
    res.status(201).json({ token, message: 'User registered successfully' });

  } catch (error: unknown) {
    console.error('Error during signup:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Handler for user login
const login = async (req: Request, res: Response): Promise<void> => {
  try {
        const { username, password } = req.body;

           // Check if the username or password was provided
        if(!username || !password){
            res.status(400).json({message: 'Please provide username and password'})
            return;
        }

    // Find the user by username in the database
    const user = await User.findOne({ username });

    // If user is not found return a 400 error
    if (!user) {
      res.status(400).json({ message: 'Invalid credentials' });
      return;
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    // If passwords doesn't match return a 400 error
    if (!isMatch) {
      res.status(400).json({ message: 'Invalid credentials' });
      return;
    }

    // Generate a JWT token for the authenticated user
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });

    // Respond with a success status, the generated token, and message
    res.status(200).json({ token, message: 'Login successful' });
    
  } catch (error: unknown) {
      console.error('Error during login:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export { signup, login };