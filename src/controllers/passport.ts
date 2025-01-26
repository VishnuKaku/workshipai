import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { visionClient } from '../services/googleVision';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Passport from '../models/Passport';
import { protos } from '@google-cloud/vision';
import { isNil } from '../utils/common';

type EntityAnnotation = protos.google.cloud.vision.v1.IEntityAnnotation;

// Storage configuration remains the same
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueFilename = `${uuidv4()}${ext}`;
    cb(null, uniqueFilename);
  },
});

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

interface StampGroup {
  date: string;
  blocks: string[];
  startIndex: number;
  type: string;
  airport?: string;
  confidence: number;
}

interface PassportEntry {
    Sl_no: string;
    Country: string;
    Airport_Name_with_location: string;
    Arrival_Departure: string;
    Date: string;
    Description: string;
    isManualEntry?: boolean;
    confidence?: number;
}


// Create a default empty entry
const createEmptyEntry = (slNo: string = '1'): PassportEntry => ({
  Sl_no: slNo,
  Country: '',
  Airport_Name_with_location: '',
  Arrival_Departure: '',
  Date: '',
  Description: '',
  isManualEntry: true,
});

function parseOCRData(
  detections: EntityAnnotation[] | null | undefined
): PassportEntry[] {
    // Handle null/undefined case
    if (!detections || detections.length === 0) {
        return [createEmptyEntry()];
    }

    const extractedText = detections
        .filter((detection): detection is EntityAnnotation & { description: string } =>
            detection.description !== null && detection.description !== undefined)
        .map(detection => detection.description);

    if (extractedText.length === 0) {
        return [createEmptyEntry()];
    }

    console.log('Raw OCR Text:', extractedText);

  const entries: PassportEntry[] = [];
  const months = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';
  const dateRegex = new RegExp(
    `\\d{1,2}\\s*(${months})\\s*\\d{4}|\\d{2}\\s*\\d{2}\\s*\\d{2}`,
    'gi'
  );

    let textBlocks: string[] = extractedText[0].split('\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  
  textBlocks = [
    ...textBlocks,
    ...textBlocks.map((block) => block.split('').reverse().join('')),
  ];

  let stampGroups: StampGroup[] = [];

  // Enhanced date detection with confidence scoring
  textBlocks.forEach((block: string, index: number) => {
    const normalizedBlock = normalizeText(block);

    if (dateRegex.test(normalizedBlock)) {
      let confidence = calculateConfidence(block, normalizedBlock);

      let stampGroup: StampGroup = {
        date: normalizedBlock,
        blocks: [normalizedBlock],
        startIndex: index,
        type: '',
        confidence: confidence,
      };

      const searchRange = 6;
      for (
        let i = Math.max(0, index - searchRange);
        i < Math.min(textBlocks.length, index + searchRange);
        i++
      ) {
        const nearbyText = normalizeText(textBlocks[i]);
        stampGroup.blocks.push(nearbyText);

        if (/ARRIVAL|ARRIV/i.test(nearbyText)) {
          stampGroup.type = 'ARRIVAL';
          stampGroup.confidence += 0.2;
        } else if (/DEPARTURE|DEPART|DEPARTME/i.test(nearbyText)) {
          stampGroup.type = 'DEPARTURE';
          stampGroup.confidence += 0.2;
        }

          if (/AIRPORT|CSMI|MUMBAI/i.test(nearbyText)) {
          stampGroup.airport = nearbyText;
          stampGroup.confidence += 0.2;
        }
      }

      stampGroups.push(stampGroup);
    }
  });

  // Remove duplicates and low confidence detections
  stampGroups = stampGroups
    .filter(
      (group, index, self) => index === self.findIndex((g) => g.date === group.date)
    )
    .filter((group) => group.confidence > 0.5);

  // Create entries including detected stamps
  stampGroups.forEach((group, index) => {
    let airportName = group.airport || 'CSMI AIRPORT, MUMBAI';

    if (!airportName.includes('MUMBAI') && airportName.includes('AIRPORT')) {
      airportName += ', MUMBAI';
    }

    if (!group.type) {
        const allText = group.blocks.join(' ');
      if (/IMMIGRATION.*IN/i.test(allText)) {
          group.type = 'ARRIVAL';
      } else if (/IMMIGRATION.*OUT/i.test(allText)) {
          group.type = 'DEPARTURE';
      } else {
          group.type = 'ARRIVAL';
        }
      }

    entries.push({
      Sl_no: (index + 1).toString(),
      Country: 'INDIA',
        Airport_Name_with_location: airportName,
      Arrival_Departure: group.type,
      Date: formatDate(group.date),
        Description: group.blocks.join(' '),
        confidence: group.confidence,
    });
  });

    // Add empty entry if no stamps were detected
  if (entries.length === 0) {
    entries.push(createEmptyEntry());
  }

  // Sort entries by date
  entries.sort((a, b) => {
      if (!a.Date) return 1;
      if (!b.Date) return -1;
    const dateA = new Date(a.Date.split('/').reverse().join('-'));
    const dateB = new Date(b.Date.split('/').reverse().join('-'));
    return dateA.getTime() - dateB.getTime();
  });

  // Reassign serial numbers
  entries.forEach((entry, index) => {
    entry.Sl_no = (index + 1).toString();
  });

    return entries;
}

function calculateConfidence(rawText: string, normalizedText: string): number {
  let confidence = 1.0;
  if (rawText !== normalizedText) confidence -= 0.1;
  if (rawText.length < 5) confidence -= 0.2;
  if (!/\d{2,4}/.test(rawText)) confidence -= 0.3;
  return Math.max(0, confidence);
}

function normalizeText(text: string): string {
    return text
    .toUpperCase()
    .replace(/[^\w\s,.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    
    const months: { [key: string]: string } = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    
    dateStr = dateStr.trim().toUpperCase();
    
    const dateMatch = dateStr.match(/(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{4})/i) ||
                     dateStr.match(/(\d{2})\s*(\d{2})\s*(\d{2})/);
    
    if (!dateMatch) return dateStr;
    
    const day = dateMatch[1].padStart(2, '0');
    let month = dateMatch[2];
    let year = dateMatch[3];
    
    if (months[month]) {
        month = months[month];
    } else if (month.length === 2) {
        month = month.padStart(2, '0');
    }
    
    if (year.length === 2) {
        year = '20' + year;
    }
    
    return `${day}/${month}/${year}`;
}

export const uploadPassportPage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
        res.status(400).json({
        message: 'No file uploaded',
        data: [createEmptyEntry()],
      });
      return;
    }

    const imagePath = path.join(uploadsDir, req.file.filename);

    try {
      const [result] = await visionClient.textDetection(imagePath);
      const extractedData = parseOCRData(result.textAnnotations || []);
        fs.unlinkSync(imagePath);
        res.status(200).json(extractedData);
    } catch (error: any) {
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        console.error('OCR processing error:', error);
      res.status(200).json([createEmptyEntry()]);
    }
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(200).json([createEmptyEntry()]);
  }
};

export const updatePassportData = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const modifiedData = req.body;
        console.log('Received modified data:', modifiedData);

        const savedEntries = await Promise.all(
            modifiedData.map(async (entry: any) => {
                const passportEntry = new Passport({
                    Sl_no: entry[0],
                    Country: entry[1],
                    Airport_Name_with_location: entry[2],
                    Arrival_Departure: entry[3],
                    Date: entry[4],
                    Description: entry[5],
                    //isManualEntry: entry[6] || false,
                    user: req.user?._id,
                });
                return await passportEntry.save();
            })
        );

        res.status(200).json({
            message: 'Data saved successfully',
            data: savedEntries,
        });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ message: 'Failed to save data' });
    }
};


export const getPassportUserHistory = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?._id;

        if (isNil(userId)) {
            res
                .status(401)
                .json({ message: 'Unauthorized: User ID not found in request' });
            return;
        }

        // Fetch all passport entries for the current user
        const passportEntries = await Passport.find({ user: userId }).sort({
            Date: 1,
        });

        if (!passportEntries || passportEntries.length === 0) {
            res
                .status(404)
                .json({ message: 'Passport data not found for this user.' });
            return;
        }

        res.status(200).json({ data: passportEntries });
    } catch (error: any) {
        console.error('Error getting user passport history:', error);
        res
            .status(500)
            .json({ message: 'Internal Server Error', error: error.message });
    }
};