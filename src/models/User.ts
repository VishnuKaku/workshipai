// server/src/models/User.ts
import mongoose, { Schema, Document } from 'mongoose';

// Define the User interface, extending Document for Mongoose
export interface User extends Document {
    username: string;
    password: string;
}

// Define the Mongoose schema for the User model
const UserSchema: Schema = new Schema({
    username: { 
        type: String, 
        required: true, // Username is required
        unique: true,   // Username must be unique
        trim: true,      // Trim whitespace from username input
        minlength: 3,  // Ensure username is at least 3 characters
         maxlength: 50, // Ensure username is no more than 50 characters
    },
    password: { 
        type: String, 
        required: true, // Password is required
         minlength: 6, // Ensure password is at least 6 characters
    },
}, {timestamps: true}); // Automatically add createdAt and updatedAt fields

// Create and export the Mongoose model for the User collection
export default mongoose.model<User>('User', UserSchema);