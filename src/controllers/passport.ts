import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { visionClient } from '../services/googleVision';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { protos } from '@google-cloud/vision';
import { parse, format, isValid } from 'date-fns';
import Passport from '../models/Passport';
import axios from 'axios';
import { Redis } from 'ioredis';
import { Image } from 'image-js';

type EntityAnnotation = protos.google.cloud.vision.v1.IEntityAnnotation;

// Configure uploads directory
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
const stampsDir = path.join(uploadsDir, 'stamps');
if (!fs.existsSync(stampsDir)) {
    fs.mkdirSync(stampsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

export const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Interfaces
interface PassportEntry {
    Sl_no: string;
    Country: string;
    Airport_Name_with_location: string;
    Arrival_Departure: string;
    Date: string;
    Description: string;
    isManualEntry?: boolean;
    confidence?: number;
    StampImage?: string; // Add field for stamp image path with uppercase S
}

interface StampData extends PassportEntry {
  boundingBox: protos.google.cloud.vision.v1.IBoundingPoly;
  stampId: string;
}

// Country and Airport Mappings
const COUNTRY_AIRPORTS: {
    [key: string]: {
        name: string;
        codes: string[];
        airports: { [key: string]: string[] };
    }
} = {
    'HR': {
        name: 'Croatia',
        codes: ['HR', 'HRV', 'CROATIA', 'HR:'],
        airports: {
            'Split Airport': ['SPLIT', 'A 008', 'A008', 'SPLIT AIRPORT'],
            'Zagreb Airport': ['ZAGREB', 'ZAG', 'ZAGREB AIRPORT'],
            'Dubrovnik Airport': ['DUBROVNIK', 'DUBROVNIK AIRPORT'],
            'Zadar Airport': ['ZADAR', 'ZAD', 'ZADAR AIRPORT']
        }
    },
    'AT': {
        name: 'Austria',
        codes: ['AT', 'AUT', 'AUSTRIA'],
        airports: {
            'Vienna International Airport': ['WIEN', 'VIENNA', 'VIE AIRPORT', 'VIENNA INTERNATIONAL AIRPORT']
        }
    },
    'BE': {
        name: 'Belgium',
        codes: ['BE', 'BEL', 'BELGIUM'],
        airports: {
            'Brussels Airport': ['BRUSSELS', 'ZAVENTEM', 'BRUSSELS AIRPORT', 'ZAVENTEM AIRPORT']
        }
    },
    'DK': {
        name: 'Denmark',
        codes: ['DK', 'DNK', 'DENMARK'],
        airports: {
            'Copenhagen Airport': ['KØBENHAVN', 'KOBENHAVN', 'KASTRUP', 'CPH AIRPORT', 'KØBENHAVN AIRPORT', 'KASTRUP AIRPORT']
        }
    },
    'FR': {
        name: 'France',
        codes: ['FR', 'FRA', 'FRANCE'],
        airports: {
            'PARIS Airport': ['ROISSY', 'PARIS CDG', 'CDG AIRPORT', 'CHARLES DE GAULLE AIRPORT', 'ROISSY AIRPORT'],
            'Orly Airport': ['PARIS ORLY', 'ORY AIRPORT', 'PARIS ORLY AIRPORT']
        }
    },
    'DE': {
        name: 'Germany',
        codes: ['DE', 'DEU', 'GERMANY'],
        airports: {
            'Frankfurt Airport': ['FRANKFURT','FRANKFURT AIRPORT'],
            'Munich Airport': ['MÜNCHEN', 'MUNICH', 'MÜNCHEN AIRPORT', 'MUNICH AIRPORT']
        }
    },
    'IT': {
        name: 'Italy',
        codes: ['IT', 'ITA', 'ITALY'],
        airports: {
            'RomeFiumicino Airport': ['ROMA', 'ROME', 'FIUMICINO', 'ROME FIUMICINO AIRPORT', 'FIUMICINO AIRPORT'],
            'MilanMalpensa Airport': ['MILANO', 'MILAN', 'MALPENSA','MILAN MALPENSA AIRPORT', 'MALPENSA AIRPORT']
        }
    },
    'NL': {
        name: 'Netherlands',
        codes: ['NL', 'NLD', 'NETHERLANDS'],
        airports: {
            'Amsterdam Airport Schiphol': ['SCHIPHOL', 'AMSTERDAM', 'AMSTERDAM AIRPORT SCHIPHOL', 'SCHIPHOL AIRPORT']
        }
    },
    'ES': {
        name: 'Spain',
        codes: ['ES', 'ESP', 'SPAIN'],
        airports: {
            'Madrid Airport': ['MADRID', 'BARAJAS','MADRID BARAJAS AIRPORT', 'BARAJAS AIRPORT'],
            'Barcelona Airport': ['BARCELONA', 'EL PRAT','BARCELONA EL PRAT AIRPORT', 'EL PRAT AIRPORT']
        }
    },
    'IN': {
        name: 'India',
        codes: ['IN', 'IND', 'INDIA'],
        airports: {
            'Delhi International Airport': ['DELHI','NEWDELHI','DELHI AIRPORT', 'NEWDELHI AIRPORT', 'INDIRA GANDHI INTERNATIONAL AIRPORT'],
            'Mumbai Airport': ['MUMBAI',  'SAHAR', 'SAHAR AIRPORT', 'CHHATRAPATI SHIVAJI INTERNATIONAL AIRPORT'],
            'Bangalore International Airport': ['BANGALORE', 'BENGALURU','BANGALORE AIRPORT', 'BENGALURU AIRPORT', 'KEMPEGOWDA INTERNATIONAL AIRPORT'],
            'Chennai International Airport': ['CHENNAI', 'MADRAS','CHENNAI AIRPORT', 'MADRAS AIRPORT', 'CHENNAI INTERNATIONAL AIRPORT']
        }
    },
    'CZ': {
        name: 'Czech Republic',
        codes: ['CZ', 'CZE', 'CZECH REPUBLIC', 'CZECH'],
        airports: {
            'VáclavHavel Airport': ['PRAGUE', 'VACLAVHAVEL', 'VACLAVHAVEL AIRPORT PRAGUE', 'PRAGUE AIRPORT'],
        }
    },
    'EE': {
        name: 'Estonia',
        codes: ['EE', 'EST', 'ESTONIA'],
        airports: {
            'LennartMeriTallinn Airport': ['TALLINN', 'LENNARTMERI', 'LENNARTMERITALLINN AIRPORT', 'TALLINN AIRPORT']
        }
    },
    'FI': {
        name: 'Finland',
        codes: ['FI', 'FIN', 'FINLAND'],
        airports: {
            'Helsinki Airport': ['HELSINKI', 'VANTAA', 'HELSINKI AIRPORT', 'VANTAA AIRPORT']
        }
    },
    'GR': {
        name: 'Greece',
        codes: ['GR', 'GRC', 'GREECE'],
        airports: {
            'Athens International Airport': ['ATHENS', 'ELEFTHERIOS VENIZELOS', 'ATHENS INTERNATIONAL AIRPORT', 'ELEFTHERIOSVENIZELOS AIRPORT'],
            'Thessaloniki Airport': ['THESSALONIKI', 'MACEDONIA', 'THESSALONIKI AIRPORT', 'MACEDONIA AIRPORT']
        }
    },
    'HU': {
        name: 'Hungary',
        codes: ['HU', 'HUN', 'HUNGARY'],
        airports: {
            'BudapestFerencLiszt International Airport': ['BUDAPEST', 'FERENC LISZT', 'BUDAPESTFERENCLISZT INTERNATIONAL AIRPORT', 'FERENCLISZT INTERNATIONAL AIRPORT'],
        }
    },
    'IS': {
        name: 'Iceland',
        codes: ['IS', 'ISL', 'ICELAND'],
        airports: {
            'Keflavík International Airport': ['KEFLAVIK', 'REYKJAVIK', 'KEFLAVIK INTERNATIONAL AIRPORT', 'REYKJAVIK AIRPORT']
        }
    },
    'LV': {
        name: 'Latvia',
        codes: ['LV', 'LVA', 'LATVIA'],
        airports: {
            'Riga International Airport': ['RIGA', 'RIGA INTERNATIONAL AIRPORT']
        }
    },
    'LI': {
        name: 'Liechtenstein',
        codes: ['LIECHTENSTEIN'],
        airports: {} 
    },
    'LT': {
        name: 'Lithuania',
        codes: ['LT', 'LTU', 'LITHUANIA'],
        airports: {
            'Vilnius Airport': ['VILNIUS', 'VILNIUS AIRPORT'],
            'Kaunas Airport': ['KAUNAS', 'KAUNAS AIRPORT'],
        }
    },
    'LU': {
        name: 'Luxembourg',
        codes: ['LU', 'LUX', 'LUXEMBOURG'],
        airports: {
            'Luxembourg Airport': ['LUXEMBOURG-FINDEL', 'LUXEMBOURG', 'LUXEMBOURG AIRPORT', 'LUXEMBOURG-FINDEL AIRPORT', 'FINDEL']
        }
    },
    'MT': {
        name: 'Malta',
        codes: ['MT', 'MLT', 'MALTA'],
        airports: {
            'Malta International Airport': ['MALTA', 'MALTA INTERNATIONAL AIRPORT']
        }
    },
    'NO': {
        name: 'Norway',
        codes: ['NO', 'NOR', 'NORWAY'],
        airports: {
            'Oslo Airport': ['OSLO', 'GARDERMOEN', 'OSLO AIRPORT', 'OSLOGARDERMOEN AIRPORT']
        }
    },
    'PL': {
        name: 'Poland',
        codes: ['PL', 'POL', 'POLAND'],
        airports: {
            'WarsawChopin Airport': ['WARSAW', 'CHOPIN', 'WARSAW CHOPIN AIRPORT', 'CHOPIN AIRPORT'],
            'Kraków International Airport': ['KRAKOW', 'KRAKÓW', 'JOHNPAULII', 'KRAKOW AIRPORT', 'KRAKÓWJOHNPAULII INTERNATIONAL AIRPORT', 'JOHNPAULII INTERNATIONAL AIRPORT']
        }
    },
    'PT': {
        name: 'Portugal',
        codes: ['PT', 'PRT', 'PORTUGAL'],
        airports: {
            'Lisbon Airport': ['LISBON', 'LISBOA', 'LISBON AIRPORT', 'LISBOA AIRPORT'],
            'FranciscoSáCarneiroAirport': ['PORTO', 'PORTO AIRPORT', 'FRANCISCOSÁCARNEIRO AIRPORT']
        }
    },
    'SK': {
        name: 'Slovakia',
        codes: ['SK', 'SVK', 'SLOVAKIA'],
        airports: {
            'Bratislava Airport': ['BRATISLAVA', 'BRATISLAVA AIRPORT']
        }
    },
    'SI': {
        name: 'Slovenia',
        codes: ['SI', 'SVN', 'SLOVENIA'],
        airports: {
            'LjubljanaJožePučnik Airport': ['LJUBLJANA', 'JOŽEPUČNIK', 'LJUBLJANAJOŽEPUČNIK AIRPORT', 'JOŽEPUČNIK AIRPORT']
        }
    },
    'SE': {
        name: 'Sweden',
        codes: ['SE', 'SWE', 'SWEDEN'],
        airports: {
            'StockholmArlanda Airport': ['STOCKHOLM', 'ARLANDA', 'STOCKHOLM ARLANDA AIRPORT', 'ARLANDA AIRPORT'],
            'GothenburgLandvetter Airport': ['GOTHENBURG', 'LANDVETTER', 'GOTHENBURG LANDVETTER AIRPORT', 'LANDVETTER AIRPORT']
        }
    },
    'CH': {
        name: 'Switzerland',
        codes: ['CH', 'CHE', 'SWITZERLAND', 'SCHWEIZ'],
        airports: {
            'Zurich Airport': ['ZURICH', 'ZÜRICH', 'ZURICH AIRPORT', 'ZÜRICH AIRPORT'],
            'Geneva Airport': ['GENEVA', 'GENÈVE', 'GENEVA AIRPORT', 'GENÈVE AIRPORT']
        }
    },
    'CN': {
        name: 'China',
        codes: ['CN', 'CHN', 'CHINA'],
        airports: {
            'Beijing Capital International Airport': ['BEIJING', 'CAPITAL', 'BEIJING CAPITAL INTERNATIONAL AIRPORT', 'PEK AIRPORT'],
            'ShanghaiPudong International Airport': ['SHANGHAI', 'PUDONG', 'SHANGHAI PUDONG INTERNATIONAL AIRPORT', 'PVG AIRPORT'],
            'GuangzhouBaiyun International Airport': ['GUANGZHOU', 'BAIYUN', 'GUANGZHOU BAIYUN INTERNATIONAL AIRPORT', 'CAN AIRPORT']
        }
    },
    'US': {
        name: 'United States of America',
        codes: ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'],
        airports: {
            'Hartsfield-Jackson Atlanta International Airport': ['ATLANTA', 'HARTSFIELD-JACKSON', 'HARTSFIELD-JACKSON ATLANTA INTERNATIONAL AIRPORT', 'ATL AIRPORT'],
            'Los Angeles International Airport': ['LOS ANGELES', 'LAX AIRPORT', 'LOS ANGELES INTERNATIONAL AIRPORT'],
            'O\'Hare International Airport': ['CHICAGO', 'O\'HARE', 'O\'HARE INTERNATIONAL AIRPORT', 'ORD AIRPORT'],
            'Dallas/Fort Worth International Airport': ['DALLAS', 'FORT WORTH', 'DALLAS/FORT WORTH INTERNATIONAL AIRPORT', 'DFW AIRPORT'],
            'Denver International Airport': ['DENVER', 'DENVER INTERNATIONAL AIRPORT', 'DEN AIRPORT'],
            'John F. Kennedy International Airport': ['NEWYORK', 'KENNEDY', 'JOHNFKENNEDY INTERNATIONAL AIRPORT']
        }
    }

};

const AIRPORT_KEYWORDS = [
    'AIRPORT', 'AEROPORTO', 'AEROPORT', 'FLUGHAFEN', 'LUFTHAVN',
    'INTERNATIONAL', 'TERMINAL', 'INTL'
];

// Helper Functions

function normalizeText(text: string): string {
    return text
        .toUpperCase()
        .replace(/[^\w\s,.-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Update the country detection logic first
function detectCountry(text: string): { country: string; confidence: number } {
    const normalizedText = normalizeText(text);
    console.log("Analyzing text for country:", normalizedText);

    // First priority: Look for standalone country codes using regex
    const countryCodeMatch = normalizedText.match(/(?:^|\s|:)([A-Z]{2})(?:\s|:|$)/);
    if (countryCodeMatch) {
        const code = countryCodeMatch[1];
        const countryData = Object.values(COUNTRY_AIRPORTS).find(data => data.codes.includes(code));
        if (countryData) {
            console.log(`Found exact country code match: ${code} -> ${countryData.name}`);
            return {
                country: countryData.name,
                confidence: 0.95
            };
        }
    }

    // Second priority: Look for city names that uniquely identify a country
    const cityMapping: { [key: string]: string } = {
        'KØBENHAVN': 'Denmark',
        'KOBENHAVN': 'Denmark',
        'KASTRUP': 'Denmark',
        'PARIS': 'France',
        'ROISSY': 'France',
        'ORLY': 'France',
        'FRANKFURT': 'Germany',
        'MÜNCHEN': 'Germany',
        'MUNICH': 'Germany',
        'AMSTERDAM': 'Netherlands',
        'SCHIPHOL': 'Netherlands',
        'MADRID': 'Spain',
        'BARAJAS': 'Spain',
        'BARCELONA': 'Spain',
        'EL PRAT': 'Spain',
        'ROMA': 'Italy',
        'ROME': 'Italy',
        'MILANO': 'Italy',
        'MILAN': 'Italy',
        'FIUMICINO': 'Italy',
        'MALPENSA': 'Italy',
        'BRUSSELS': 'Belgium',
        'ZAVENTEM': 'Belgium',
        'WIEN': 'Austria',
        'VIENNA': 'Austria',
        'SPLIT': 'Croatia',
        'ZAGREB': 'Croatia',
        'DUBROVNIK': 'Croatia',
        'ZADAR': 'Croatia',
        'MUMBAI': 'India',
        'DELHI': 'India',
        'NEW DELHI': 'India',
        'BANGALORE': 'India',
        'BENGALURU': 'India',
        'CHENNAI': 'India',
        'MADRAS': 'India',
        'PRAGUE': 'Czech Republic',
        'VACLAV HAVEL': 'Czech Republic',
        'TALLINN': 'Estonia',
        'LENNART MERI': 'Estonia',
        'HELSINKI': 'Finland',
        'VANTAA': 'Finland',
        'ATHENS': 'Greece',
        'ELEFTHERIOS VENIZELOS': 'Greece',
        'THESSALONIKI': 'Greece',
        'MACEDONIA': 'Greece',
        'BUDAPEST': 'Hungary',
        'FERENC LISZT': 'Hungary',
        'REYKJAVIK': 'Iceland',
        'KEFLAVIK': 'Iceland',
        'RIGA': 'Latvia',
        'VILNIUS': 'Lithuania',
        'KAUNAS': 'Lithuania',
        'LUXEMBOURG': 'Luxembourg',
        'MALTA': 'Malta',
        'OSLO': 'Norway',
        'GARDERMOEN': 'Norway',
        'WARSAW': 'Poland',
        'CHOPIN': 'Poland',
        'KRAKOW': 'Poland',
        'KRAKÓW': 'Poland',
        'JOHN PAUL II': 'Poland',
        'LISBON': 'Portugal',
        'LISBOA': 'Portugal',
        'PORTO': 'Portugal',
        'BRATISLAVA': 'Slovakia',
        'LJUBLJANA': 'Slovenia',
        'JOŽE PUČNIK': 'Slovenia',
        'STOCKHOLM': 'Sweden',
        'ARLANDA': 'Sweden',
        'GOTHENBURG': 'Sweden',
        'LANDVETTER': 'Sweden',
        'ZURICH': 'Switzerland',
        'ZÜRICH': 'Switzerland',
        'GENEVA': 'Switzerland',
        'GENÈVE': 'Switzerland',
        'BEIJING': 'China',
        'SHANGHAI': 'China',
        'GUANGZHOU': 'China',
        'ATLANTA': 'United States of America',
        'LOS ANGELES': 'United States of America',
        'CHICAGO': 'United States of America',
        'DALLAS': 'United States of America',
        'FORT WORTH': 'United States of America',
        'DENVER': 'United States of America',
        'NEW YORK': 'United States of America',
        'KENNEDY': 'United States of America'
    };


    for (const [city, country] of Object.entries(cityMapping)) {
        if (normalizedText.includes(city)) {
            console.log(`Found city match: ${city} -> ${country}`);
            return {
                country: country,
                confidence: 0.9
            };
        }
    }

    // Last priority: Check for full country names
    for (const [code, countryData] of Object.entries(COUNTRY_AIRPORTS)) {
        if (normalizedText.includes(countryData.name.toUpperCase())) {
            return {
                country: countryData.name,
                confidence: 0.8
            };
        }
    }

    return {
        country: 'India', // Default to India if no match found
        confidence: 0.5
    };
}

// Update the airport detection logic
function detectAirport(blocks: string[], country: string): { airport: string; confidence: number } {
    const normalizedBlocks = blocks.map(normalizeText);
    const combinedText = normalizedBlocks.join(' ');
    console.log("Analyzing blocks for airport:", normalizedBlocks);

    // Find country data
    const countryData = Object.values(COUNTRY_AIRPORTS).find(data => data.name === country);
    if (!countryData) {
        return {
            airport: 'Unknown International Airport',
            confidence: 0.3
        };
    }

    // Check for specific airport codes and names
    for (const [airportName, codes] of Object.entries(countryData.airports)) {
        if (codes.some(code => combinedText.includes(code))) {
            const airportNameMatch = codes.find(code => combinedText.includes(code));
            if (airportNameMatch) {
                return {
                    airport: airportNameMatch.toUpperCase().includes('AIRPORT') ? airportNameMatch.toUpperCase() : `${airportNameMatch.toUpperCase()} AIRPORT`,
                    confidence: 0.9
                };
            }
        }
    }


    // Check for airport keywords
    for (const block of normalizedBlocks) {
        if (AIRPORT_KEYWORDS.some(keyword => block.includes(keyword))) {
            // If we found an airport keyword and we know the country,
            // return the main airport of that country
            const mainAirport = Object.keys(countryData.airports)[0];
            if (mainAirport) {
                return {
                    airport: mainAirport,
                    confidence: 0.7
                };
            }
            return {
                airport: block,
                confidence: 0.6
            };
        }
    }

    // Return country's main airport if known
    const mainAirport = Object.keys(countryData.airports)[0];
    if (mainAirport) {
        return {
            airport: mainAirport,
            confidence: 0.5
        };
    }

    return {
        airport: 'Unknown International Airport',
        confidence: 0.3
    };
}

// First update the function signature
function detectStampType(text: string, blocks: string[]): 'ARRIVAL' | 'DEPARTURE' {
    const normalizedText = normalizeText(text);

    // Check for explicit text keywords first
    const arrivalKeywords = ['ARRIVAL', 'IMMIGRATION IN', 'ENTRY', 'ADMITTED', 'ENTRADA', 'IN', 'ENTRÉE', 'EINREISE'];
    const departureKeywords = ['DEPARTURE', 'IMMIGRATION OUT', 'EXIT', 'LEFT', 'SALIDA', 'OUT', 'SORTIE', 'AUSREISE', 'DEPARTED'];

    // Arrow symbols detection
    const leftArrowSymbols = ['←', '⇐', '<-', '<='];  // Usually indicates Arrival
    const rightArrowSymbols = ['→', '⇒', '->', '=>'];  // Usually indicates Departure

    // Check for arrow symbols in combined text
    for (const symbol of leftArrowSymbols) {
        if (normalizedText.includes(symbol)) {
            return 'ARRIVAL';
        }
    }
    for (const symbol of rightArrowSymbols) {
        if (normalizedText.includes(symbol)) {
            return 'DEPARTURE';
        }
    }

    // Check for arrow-like characters in ASCII art or special formatting
    const arrowPatterns = {
        arrival: [/[-=]*>/, /<[-=]*/, /\[?←\]?/, /\[?⇐\]?/],
        departure: [/<[-=]*/, /[-=]*>/, /\[?→\]?/, /\[?⇒\]?/]
    };

    for (const block of blocks) {
        const normalizedBlock = normalizeText(block);
        // Check for arrow patterns indicating departure
        for (const pattern of arrowPatterns.departure) {
            if (pattern.test(normalizedBlock)) {
                return 'DEPARTURE';
            }
        }
        // Check for arrow patterns indicating arrival
        for (const pattern of arrowPatterns.arrival) {
            if (pattern.test(normalizedBlock)) {
                return 'ARRIVAL';
            }
        }
    }

    // If no arrows found, fall back to keyword detection
    for (const keyword of departureKeywords) {
        if (normalizedText.includes(keyword)) {
            return 'DEPARTURE';
        }
    }

    for (const keyword of arrivalKeywords) {
        if (normalizedText.includes(keyword)) {
            return 'ARRIVAL';
        }
    }

    // Default fallback
    return 'ARRIVAL';
}

function formatDate(dateStr: string): string {
    if (!dateStr) return '';

    const dateFormats = [
        'dd.MM.yy', 'dd.MM.yyyy', 'dd MMM yyyy',
        'dd-MM-yy', 'dd-MM-yyyy', 'dd MMM yy',
        'yyyy-MM-dd', 'yyyy.MM.dd', 'dd-MMM-yyyy',
        'dd-MMM-yy', 'MM.dd.yyyy'
    ];

    for (const fmt of dateFormats) {
        try {
            const parsedDate = parse(dateStr, fmt, new Date());
            if (isValid(parsedDate)) {
                return format(parsedDate, 'dd/MM/yyyy');
            }
        } catch {
            continue;
        }
    }

    // Try extracting date components with regex
    const dateRegex = /(\d{1,2})[.\s/-](\d{1,2}|\w{3})[.\s/-](\d{2,4})/i;
    const match = dateStr.match(dateRegex);
    if (match) {
        try {
            const [_, day, monthStr, year] = match;
            const month = isNaN(Number(monthStr))
                ? new Date(Date.parse(`${monthStr} 1, 2000`)).getMonth() + 1
                : Number(monthStr);
            const fullYear = year.length === 2 ? `20${year}` : year;
            const dateObj = new Date(Number(fullYear), month - 1, Number(day));
            if (isValid(dateObj)) {
                return format(dateObj, 'dd/MM/yyyy');
            }
        } catch {
            return '';
        }
    }

    return '';
}

function parseStamp(textAnnotations: EntityAnnotation[]): StampData[] {
    if (!textAnnotations?.length) {
        return [];
    }

    const text = textAnnotations[0]?.description || '';
    const blocks = text.split('\n').filter(block => block.trim().length > 0);
    const dateRegex = /(\d{1,2})[.\s/-](\d{1,2}|\w{3})[.\s/-](\d{2,4})/i;
    const dateRegex1 = /DD.MM.YY/;
    const entries: StampData[] = [];
    let slNo = 1;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        let dateMatch = block.match(dateRegex) || block.match(dateRegex1);
        if (dateMatch) {
            const countryResult = detectCountry(text);
            const airportResult = detectAirport(blocks, countryResult.country);
            const descriptionBlocks: string[] = [];
            // collect the description
            for (let j = Math.max(0, i - 3); j < Math.min(blocks.length, i + 3); j++) {
                descriptionBlocks.push(blocks[j]);
            }
            const description = descriptionBlocks.join('\n');
            const boundingBox = textAnnotations[0]?.boundingPoly;
            if (!boundingBox) {
                continue; // Skip this entry if boundingBox is not available
            }
            const stampId = uuidv4();
            entries.push({
                Sl_no: slNo.toString(),
                Country: countryResult.country,
                Airport_Name_with_location: airportResult.airport,
                Arrival_Departure: detectStampType(description, blocks),
                Date: dateMatch ? formatDate(block) : "",
                Description: description,
                confidence: Math.min(countryResult.confidence, airportResult.confidence),
                boundingBox,
                stampId
            });
            slNo++;
        }
    }

    return entries.length > 0 ? entries : [];
}

// Function to crop and save the stamp image
async function cropAndSaveStamp(imagePath: string, boundingBox: protos.google.cloud.vision.v1.IBoundingPoly, stampId: string): Promise<string | null> {
    try {
        const image = await Image.load(imagePath);
        if (!boundingBox || !boundingBox.vertices || boundingBox.vertices.length !== 4) {
            console.error('Invalid bounding box coordinates:', boundingBox);
            return null;
        }

        // Add padding percentage (15%)
        const paddingPercent = 0.15;

        const xCoordinates = boundingBox.vertices.map(v => v.x || 0);
        const yCoordinates = boundingBox.vertices.map(v => v.y || 0);

        let minX = Math.min(...xCoordinates);
        let maxX = Math.max(...xCoordinates);
        let minY = Math.min(...yCoordinates);
        let maxY = Math.max(...yCoordinates);

        // Calculate padding values
        const width = maxX - minX;
        const height = maxY - minY;
        const paddingX = width * paddingPercent;
        const paddingY = height * paddingPercent;

        // Apply padding
        minX = Math.max(0, minX - paddingX);
        maxX = Math.min(image.width, maxX + paddingX);
        minY = Math.max(0, minY - paddingY);
        maxY = Math.min(image.height, maxY + paddingY);

        if (minX >= maxX || minY >= maxY) {
            console.error('Invalid cropping coordinates after padding:', { minX, maxX, minY, maxY });
            return null;
        }

        const croppedImage = image.crop({ 
            x: Math.floor(minX), 
            y: Math.floor(minY), 
            width: Math.ceil(maxX - minX), 
            height: Math.ceil(maxY - minY) 
        });
        
        const stampImagePath = path.join(stampsDir, `${stampId}.jpg`);
        await croppedImage.save(stampImagePath, { format: 'jpg' });
        return `/uploads/stamps/${stampId}.jpg`;
    } catch (error) {
        console.error('Error cropping and saving image:', error);
        return null;
    }
}

// API Endpoints
export const uploadPassportPage = async (
   req: Request,
   res: Response,
   next: NextFunction
): Promise<void> => {
   try {
       if (!req.file) {
           res.status(400).json({
               message: 'No file uploaded',
               data: []
           });
           return;
       }

       const imagePath = path.join(uploadsDir, req.file.filename);

       try {
           const [result] = await visionClient.textDetection(imagePath);
           const parsedStamps = parseStamp(result.textAnnotations || []);
           const passportEntries: PassportEntry[] = [];
           for (const stampData of parsedStamps) {
                const stampImagePath = await cropAndSaveStamp(imagePath, stampData.boundingBox, stampData.stampId);
                 passportEntries.push({
                      ...stampData,
                      StampImage: stampImagePath || '',
                 });
           }
           fs.unlinkSync(imagePath);
          res.status(200).json(passportEntries);

       } catch (error) {
           console.error('OCR processing error:', error);
           if (fs.existsSync(imagePath)) {
               fs.unlinkSync(imagePath);
           }
           res.status(200).json([]);
       }
   } catch (error) {
       console.error('Upload error:', error);
       res.status(200).json([]);
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
                // Keep the original StampImage path if it exists
                const stampImagePath = entry.StampImage || '';
                
                const passportEntry = new Passport({
                    Sl_no: entry.Sl_no,
                    StampImage: stampImagePath, // Save the original path
                    Country: entry.Country.trim(),
                    Airport_Name_with_location: entry.Airport_Name_with_location.trim(),
                    Arrival_Departure: entry.Arrival_Departure.trim(),
                    Date: entry.Date.trim(),
                    Description: entry.Description.trim(),
                    user: req.user?._id,
                });
                
                console.log("Saving passport entry with image:", {
                    ...passportEntry.toObject(),
                    StampImage: stampImagePath
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
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized: User ID not found in request' });
            return;
        }
        const passportEntries = await Passport.find({ user: userId }).sort({ Date: 1 });
        if (!passportEntries || passportEntries.length === 0) {
            res.status(404).json({ message: 'Passport data not found for this user.' });
            return;
        }
        res.status(200).json({ data: passportEntries });
    } catch (error: any) {
        console.error('Error getting user passport history:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

interface GeocodingResult {
   lat: number;
   lng: number;
}

interface LocationIQResponse {
   lat: string;
   lon: string;
}

class GeocodingService {
   private static instance: GeocodingService;
   private pendingRequests: Map<string, ((value: GeocodingResult | null) => void)[]>;
   private memoryCache: Map<string, GeocodingResult>;
   private redis?: Redis;
   private requestQueue: string[];
   private isProcessingQueue: boolean;

   private constructor() {
       this.pendingRequests = new Map();
       this.memoryCache = new Map();
       this.requestQueue = [];
       this.isProcessingQueue = false;

       // Initialize Redis if REDIS_URL is available
       if (process.env.REDIS_URL) {
           this.redis = new Redis(process.env.REDIS_URL);
       }
   }

   public static getInstance(): GeocodingService {
       if (!GeocodingService.instance) {
           GeocodingService.instance = new GeocodingService();
       }
       return GeocodingService.instance;
   }

   private async checkCache(key: string): Promise<GeocodingResult | null> {
       // Check memory cache first
       if (this.memoryCache.has(key)) {
           console.log(`Using memory cache for: ${key}`);
           return this.memoryCache.get(key)!;
       }

       // Check Redis cache if available
       if (this.redis) {
           const cached = await this.redis.get(`geocode:${key}`);
           if (cached) {
               console.log(`Using Redis cache for: ${key}`);
               const result = JSON.parse(cached);
               this.memoryCache.set(key, result);
               return result;
           }
       }

       return null;
   }

   private async setCache(key: string, value: GeocodingResult): Promise<void> {
       // Set memory cache
       this.memoryCache.set(key, value);

       // Set Redis cache if available
       if (this.redis) {
           await this.redis.set(
               `geocode:${key}`,
               JSON.stringify(value),
               'EX',
               60 * 60 * 24 * 30 // 30 days expiration
           );
       }
   }

   private async geocodeWithRetry(
       airportName: string,
       retries = 3,
       initialDelay = 1000
   ): Promise<GeocodingResult | null> {
       const apiKey = process.env.LOCATIONIQ_API_KEY;
       const url = `https://us1.locationiq.com/v1/search.php?key=${apiKey}&q=${encodeURIComponent(airportName)}&format=json`;

       let delay = initialDelay;

       for (let attempt = 0; attempt < retries; attempt++) {
           try {
               const response = await axios.get<LocationIQResponse[]>(url);
               const data = response.data;

               if (data && data.length > 0) {
                   const result = {
                       lat: parseFloat(data[0].lat),
                       lng: parseFloat(data[0].lon)
                   };
                   await this.setCache(airportName, result);
                   console.log(`Geocoded and cached: ${airportName}`);
                   return result;
               }
               return null;
           } catch (error: any) {
               if (error.response?.status === 429 && attempt < retries - 1) {
                   console.warn(`Rate limit hit for: ${airportName}. Retrying in ${delay}ms...`);
                   await new Promise(resolve => setTimeout(resolve, delay));
                   delay *= 2; // Exponential backoff
                   continue;
               }
               console.error(`Failed to geocode airport after retries: ${airportName}`, error.message);
               return null; // Return null instead of throwing
           }
       }
       return null;
   }

   // Updated processQueue method in GeocodingService class
   private async processQueue(): Promise<void> {
       if (this.isProcessingQueue) return;

       this.isProcessingQueue = true;
       const BATCH_SIZE = 5;
       const BATCH_DELAY = 1000;

       try {
           while (this.requestQueue.length > 0) {
               const batch = this.requestQueue.splice(0, BATCH_SIZE);
               const promises = batch.map(airportName => this.geocodeWithRetry(airportName));
               const results = await Promise.all(promises);

               results.forEach((result, index) => {
                   const airportName = batch[index];
                   const pendingResolves = this.pendingRequests.get(airportName);
                   if (pendingResolves) {
                       pendingResolves.forEach(resolve => resolve(result));
                       this.pendingRequests.delete(airportName);
                   }
               });

               // Delay between batches if more items remain
               if (this.requestQueue.length > 0) {
                   await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
               }
           }
       } finally {
           this.isProcessingQueue = false;
           // Check if new requests came in while processing
           if (this.requestQueue.length > 0) {
               this.processQueue();
           }
       }
   }

   public async geocodeAirport(airportName: string): Promise<GeocodingResult | null> {
       const cached = await this.checkCache(airportName);
       if (cached) return cached;

       if (this.pendingRequests.has(airportName)) {
           return new Promise(resolve => {
               this.pendingRequests.get(airportName)?.push(resolve);
           });
       }

       const promise = new Promise<GeocodingResult | null>((resolve) => {
           this.pendingRequests.set(airportName, [resolve]);
       });

       this.requestQueue.push(airportName);
       this.processQueue(); // Ensure queue processing is triggered
       return promise;
   }

   public async batchGeocode(airportNames: string[]): Promise<(GeocodingResult | null)[]> {
       return Promise.all(airportNames.map(name => this.geocodeAirport(name)));
   }
}

// Updated controller function
export const getPassportUserHistoryForMap = async (
   req: Request,
   res: Response
): Promise<void> => {
   try {
       const userId = req.user?._id;
       if (!userId) {
           res.status(401).json({ message: 'Unauthorized: User ID not found in request' });
           return;
       }

       const passportEntries = await Passport.find({ user: userId }).sort({ Date: 1 });

       if (!passportEntries?.length) {
           res.status(404).json({ message: 'Passport data not found for this user.' });
           return;
       }

       const geocodingService = GeocodingService.getInstance();
       const airportNames = passportEntries.map(entry => entry.Airport_Name_with_location);
       const coordinates = await geocodingService.batchGeocode(airportNames);

       const geocodedData = passportEntries.map((entry, index) => ({
           ...entry.toObject(),
           coordinates: coordinates[index] || { lat: 0, lng: 0 }
       }));

       res.status(200).json({ data: geocodedData });
   } catch (error: any) {
       console.error('Error getting user passport history for map:', error);
       res.status(500).json({ message: 'Internal Server Error', error: error.message });
   }
};

export const getWordCloudData = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized: User ID not found in request' });
            return;
        }

        const passportEntries = await Passport.find({ user: userId });
        console.log("Total passport entries found:", passportEntries.length);

        const wordMap = new Map<string, number>();
        const excludeWords = ['AIRPORT', 'INTERNATIONAL', 'CAPITAL', 'THE', 'AND', 'FOR', 'WITH'];
        
        // Log all airport names before processing
        console.log("All Airport Names:");
        passportEntries.forEach(entry => {
            console.log("Airport Name:", entry.Airport_Name_with_location);
        });

        passportEntries.forEach(entry => {
            const locationText = entry.Airport_Name_with_location.toUpperCase();
            console.log("Processing location:", locationText);

            // Specifically check for Mumbai
            if (locationText.includes('MUMBAI')) {
                console.log("Found Mumbai in:", locationText);
                const count = (wordMap.get('MUMBAI') || 0) + 3;
                wordMap.set('MUMBAI', count);
                console.log("Mumbai count:", count);
            }

            const words = locationText
                .split(' ')
                .map(word => word.trim())
                .filter(word => 
                    word.length > 0 && 
                    !excludeWords.includes(word)
                );
            
            console.log("Processed words:", words);

            words.forEach(word => {
                if (word) {
                    const count = (wordMap.get(word) || 0) + 2;
                    wordMap.set(word, count);
                }
            });
        });

        // Log the word map before converting to array
        console.log("Final Word Map:", Object.fromEntries(wordMap));

        const wordsArray = Array.from(wordMap.entries())
            .map(([text, value]) => ({ text, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 50);

        console.log("Final words array:", wordsArray);

        res.status(200).json({
            success: true,
            data: wordsArray
        });
    } catch (error: any) {
        console.error('Error generating word cloud data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate word cloud data',
            error: error.message 
        });
    }
};

// In your backend controller file (e.g., passportController.ts)
export const getUniqueStampImages = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized: User ID not found in request' });
            return;
        }

        // Fetch unique stamp images for the user
        const uniqueStamps = await Passport.distinct('StampImage', { user: userId });

        // Filter out null or undefined values
        const filteredStamps = uniqueStamps.filter(stamp => !!stamp);

        res.status(200).json({ data: filteredStamps });
    } catch (error: any) {
        console.error('Error fetching unique stamp images:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};