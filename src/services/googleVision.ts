// server/src/services/googleVision.ts
import { ImageAnnotatorClient } from "@google-cloud/vision";
import path from "path";
import dotenv from "dotenv";

dotenv.config();
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./src/config/google-cloud-credentials.json";
console.log(keyPath)
export const visionClient = new ImageAnnotatorClient({
    keyFilename: path.resolve(keyPath)
});