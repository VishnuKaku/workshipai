// server/src/services/googleVision.ts
import { ImageAnnotatorClient } from "@google-cloud/vision";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

let visionClient: ImageAnnotatorClient;

try {
  // First, check if credentials are provided as a JSON string in env
  if (process.env.GOOGLE_CREDENTIALS) {
    // If credentials are provided as environment variable
    visionClient = new ImageAnnotatorClient({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS)
    });
  } 
  // Fallback to file-based credentials if GOOGLE_CREDENTIALS env var isn't set
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    visionClient = new ImageAnnotatorClient({
      keyFilename: path.resolve(keyPath)
    });
  } 
  else {
    throw new Error('No Google Cloud credentials found');
  }
} catch (error) {
  console.error('Error initializing Google Vision client:', error);
  throw error;
}

export { visionClient };