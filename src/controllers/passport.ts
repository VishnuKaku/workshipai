import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { visionClient } from '../services/googleVision';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { protos } from '@google-cloud/vision';
import { parse, format, isValid } from 'date-fns';
import Passport from '../models/Passport';
import { isNil } from '../utils/common';

type EntityAnnotation = protos.google.cloud.vision.v1.IEntityAnnotation;

// Configure uploads directory
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
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
}

// Country and Airport Mappings
const COUNTRY_AIRPORTS: { [key: string]: { 
    name: string, 
    codes: string[],
    airports: { [key: string]: string[] } 
}} = {
     'HR': {
        name: 'Croatia',
        codes: ['HR', 'HRV', 'CROATIA', 'HR:'],
        airports: {
             'Split Airport': ['SPLIT', 'SPU', 'A 008', 'A008', 'SPLIT AIRPORT', 'SPU AIRPORT'],
            'Zagreb Airport': ['ZAGREB', 'ZAG', 'ZAGREB AIRPORT'],
            'Dubrovnik Airport': ['DUBROVNIK', 'DBV', 'DUBROVNIK AIRPORT'],
            'Zadar Airport': ['ZADAR', 'ZAD', 'ZADAR AIRPORT']
        }
    },
    'AT': {
        name: 'Austria',
        codes: ['AT', 'AUT', 'AUSTRIA'],
        airports: {
            'Vienna International Airport': ['VIE', 'WIEN', 'VIENNA', 'VIE AIRPORT', 'VIENNA INTERNATIONAL AIRPORT']
        }
    },
    'BE': {
        name: 'Belgium',
        codes: ['BE', 'BEL', 'BELGIUM'],
        airports: {
            'Brussels Airport': ['BRU', 'BRUSSELS', 'ZAVENTEM', 'BRUSSELS AIRPORT', 'ZAVENTEM AIRPORT']
        }
    },
    'DK': {
        name: 'Denmark',
        codes: ['DK', 'DNK', 'DENMARK'],
        airports: {
            'Copenhagen Airport': ['CPH', 'KØBENHAVN', 'KOBENHAVN', 'KASTRUP', 'CPH AIRPORT', 'KØBENHAVN AIRPORT', 'KASTRUP AIRPORT']
        }
    },
    'FR': {
        name: 'France',
        codes: ['FR', 'FRA', 'FRANCE'],
        airports: {
            'Charles de Gaulle Airport': ['CDG', 'ROISSY', 'PARIS CDG', 'CDG AIRPORT', 'CHARLES DE GAULLE AIRPORT', 'ROISSY AIRPORT'],
            'Orly Airport': ['ORY', 'PARIS ORLY', 'ORY AIRPORT', 'PARIS ORLY AIRPORT']
        }
    },
    'DE': {
        name: 'Germany',
        codes: ['DE', 'DEU', 'GERMANY'],
        airports: {
            'Frankfurt Airport': ['FRA', 'FRANKFURT', 'FRA AIRPORT', 'FRANKFURT AIRPORT'],
            'Munich Airport': ['MUC', 'MÜNCHEN', 'MUNICH', 'MUC AIRPORT', 'MÜNCHEN AIRPORT', 'MUNICH AIRPORT']
        }
    },
    'IT': {
        name: 'Italy',
        codes: ['IT', 'ITA', 'ITALY'],
        airports: {
           'Rome Fiumicino Airport': ['FCO', 'ROMA', 'ROME', 'FIUMICINO', 'FCO AIRPORT', 'ROME FIUMICINO AIRPORT', 'FIUMICINO AIRPORT'],
           'Milan Malpensa Airport': ['MXP', 'MILANO', 'MILAN', 'MALPENSA', 'MXP AIRPORT', 'MILAN MALPENSA AIRPORT', 'MALPENSA AIRPORT']
        }
    },
    'NL': {
        name: 'Netherlands',
        codes: ['NL', 'NLD', 'NETHERLANDS'],
        airports: {
            'Amsterdam Airport Schiphol': ['AMS', 'SCHIPHOL', 'AMSTERDAM', 'AMS AIRPORT', 'AMSTERDAM AIRPORT SCHIPHOL', 'SCHIPHOL AIRPORT']
        }
    },
    'ES': {
        name: 'Spain',
        codes: ['ES', 'ESP', 'SPAIN'],
        airports: {
           'Madrid Barajas Airport': ['MAD', 'MADRID', 'BARAJAS', 'MAD AIRPORT', 'MADRID BARAJAS AIRPORT', 'BARAJAS AIRPORT'],
           'Barcelona El Prat Airport': ['BCN', 'BARCELONA', 'EL PRAT', 'BCN AIRPORT', 'BARCELONA EL PRAT AIRPORT', 'EL PRAT AIRPORT']
        }
    },
     'IN': {
        name: 'India',
        codes: ['IN', 'IND', 'INDIA'],
        airports: {
            'Indira Gandhi International Airport': ['DEL', 'DELHI', 'IGI', 'NEW DELHI', 'DEL AIRPORT', 'DELHI AIRPORT', 'IGI AIRPORT', 'NEW DELHI AIRPORT', 'INDIRA GANDHI INTERNATIONAL AIRPORT'],
            'Chhatrapati Shivaji International Airport': ['BOM', 'MUMBAI', 'CSMI', 'SAHAR', 'BOM AIRPORT', 'MUMBAI AIRPORT', 'CSMI AIRPORT', 'SAHAR AIRPORT', 'CHHATRAPATI SHIVAJI INTERNATIONAL AIRPORT'],
            'Kempegowda International Airport': ['BLR', 'BANGALORE', 'BENGALURU', 'BLR AIRPORT', 'BANGALORE AIRPORT', 'BENGALURU AIRPORT', 'KEMPEGOWDA INTERNATIONAL AIRPORT'],
            'Chennai International Airport': ['MAA', 'CHENNAI', 'MADRAS', 'MAA AIRPORT', 'CHENNAI AIRPORT', 'MADRAS AIRPORT', 'CHENNAI INTERNATIONAL AIRPORT']
        }
    },
    'CZ': {
        name: 'Czech Republic',
        codes: ['CZ', 'CZE', 'CZECH REPUBLIC', 'CZECH'],
         airports: {
            'Václav Havel Airport Prague': ['PRG', 'PRAGUE', 'VACLAV HAVEL', 'VACLAV HAVEL AIRPORT PRAGUE', 'PRAGUE AIRPORT'],
         }
    },
     'EE': {
        name: 'Estonia',
        codes: ['EE', 'EST', 'ESTONIA'],
        airports: {
             'Lennart Meri Tallinn Airport': ['TLL', 'TALLINN', 'LENNART MERI', 'LENNART MERI TALLINN AIRPORT', 'TALLINN AIRPORT']
        }
    },
    'FI': {
        name: 'Finland',
         codes: ['FI', 'FIN', 'FINLAND'],
        airports: {
             'Helsinki Airport': ['HEL', 'HELSINKI', 'VANTAA', 'HELSINKI AIRPORT', 'VANTAA AIRPORT']
        }
    },
     'GR': {
        name: 'Greece',
         codes: ['GR', 'GRC', 'GREECE'],
        airports: {
              'Athens International Airport': ['ATH', 'ATHENS', 'ELEFTHERIOS VENIZELOS', 'ATHENS INTERNATIONAL AIRPORT', 'ELEFTHERIOS VENIZELOS AIRPORT'],
              'Thessaloniki Airport': ['SKG', 'THESSALONIKI', 'MACEDONIA', 'THESSALONIKI AIRPORT', 'MACEDONIA AIRPORT']

        }
    },
      'HU': {
        name: 'Hungary',
         codes: ['HU', 'HUN', 'HUNGARY'],
        airports: {
            'Budapest Ferenc Liszt International Airport': ['BUD', 'BUDAPEST', 'FERENC LISZT', 'BUDAPEST FERENC LISZT INTERNATIONAL AIRPORT', 'FERENC LISZT INTERNATIONAL AIRPORT'],
        }
    },
    'IS': {
        name: 'Iceland',
         codes: ['IS', 'ISL', 'ICELAND'],
         airports: {
            'Keflavík International Airport': ['KEF', 'KEFLAVIK', 'REYKJAVIK', 'KEFLAVIK INTERNATIONAL AIRPORT', 'REYKJAVIK AIRPORT']
          }
    },
    'LV': {
        name: 'Latvia',
         codes: ['LV', 'LVA', 'LATVIA'],
        airports: {
            'Riga International Airport': ['RIX', 'RIGA', 'RIGA INTERNATIONAL AIRPORT']
        }
    },
     'LI': {
        name: 'Liechtenstein',
         codes: ['LI', 'LIE', 'LIECHTENSTEIN'],
         airports: {} // Liechtenstein does not have its own international airport
    },
     'LT': {
        name: 'Lithuania',
         codes: ['LT', 'LTU', 'LITHUANIA'],
           airports: {
                'Vilnius Airport': ['VNO', 'VILNIUS', 'VILNIUS AIRPORT'],
                'Kaunas Airport': ['KUN', 'KAUNAS', 'KAUNAS AIRPORT'],
        }
    },
     'LU': {
        name: 'Luxembourg',
         codes: ['LU', 'LUX', 'LUXEMBOURG'],
          airports: {
            'Luxembourg Airport': ['LUX', 'LUXEMBOURG-FINDEL','LUXEMBOURG', 'LUXEMBOURG AIRPORT', 'LUXEMBOURG-FINDEL AIRPORT', 'FINDEL']
        }
    },
     'MT': {
        name: 'Malta',
         codes: ['MT', 'MLT', 'MALTA'],
          airports: {
            'Malta International Airport': ['MLA', 'MALTA', 'MALTA INTERNATIONAL AIRPORT']
        }
    },
    'NO': {
        name: 'Norway',
         codes: ['NO', 'NOR', 'NORWAY'],
          airports: {
               'Oslo Airport': ['OSL', 'OSLO', 'GARDERMOEN', 'OSLO AIRPORT', 'OSLO GARDERMOEN AIRPORT']
          }
    },
    'PL': {
        name: 'Poland',
         codes: ['PL', 'POL', 'POLAND'],
          airports: {
               'Warsaw Chopin Airport': ['WAW', 'WARSAW', 'CHOPIN', 'WARSAW CHOPIN AIRPORT', 'CHOPIN AIRPORT'],
               'Kraków John Paul II International Airport': ['KRK', 'KRAKOW', 'KRAKÓW', 'JOHN PAUL II', 'KRAKOW AIRPORT', 'KRAKÓW JOHN PAUL II INTERNATIONAL AIRPORT', 'JOHN PAUL II INTERNATIONAL AIRPORT']
        }
    },
     'PT': {
        name: 'Portugal',
         codes: ['PT', 'PRT', 'PORTUGAL'],
         airports: {
              'Lisbon Airport': ['LIS', 'LISBON', 'LISBOA', 'LISBON AIRPORT', 'LISBOA AIRPORT'],
              'Francisco Sá Carneiro Airport': ['OPO', 'PORTO', 'PORTO AIRPORT', 'FRANCISCO SÁ CARNEIRO AIRPORT']
          }
    },
    'SK': {
        name: 'Slovakia',
         codes: ['SK', 'SVK', 'SLOVAKIA'],
         airports: {
            'Bratislava Airport': ['BTS', 'BRATISLAVA', 'BRATISLAVA AIRPORT']
         }
    },
    'SI': {
        name: 'Slovenia',
         codes: ['SI', 'SVN', 'SLOVENIA'],
        airports: {
            'Ljubljana Jože Pučnik Airport': ['LJU', 'LJUBLJANA', 'JOŽE PUČNIK', 'LJUBLJANA JOŽE PUČNIK AIRPORT', 'JOŽE PUČNIK AIRPORT']
        }
    },
     'SE': {
        name: 'Sweden',
         codes: ['SE', 'SWE', 'SWEDEN'],
         airports: {
            'Stockholm Arlanda Airport': ['ARN', 'STOCKHOLM', 'ARLANDA', 'STOCKHOLM ARLANDA AIRPORT', 'ARLANDA AIRPORT'],
             'Gothenburg Landvetter Airport': ['GOT', 'GOTHENBURG', 'LANDVETTER', 'GOTHENBURG LANDVETTER AIRPORT', 'LANDVETTER AIRPORT']
         }
    },
    'CH': {
        name: 'Switzerland',
         codes: ['CH', 'CHE', 'SWITZERLAND', 'SCHWEIZ'],
         airports: {
           'Zurich Airport': ['ZRH', 'ZURICH', 'ZÜRICH', 'ZURICH AIRPORT', 'ZÜRICH AIRPORT'],
           'Geneva Airport': ['GVA', 'GENEVA', 'GENÈVE', 'GENEVA AIRPORT', 'GENÈVE AIRPORT']
        }
    }
};

const AIRPORT_KEYWORDS = [
    'AIRPORT', 'AEROPORTO', 'AEROPORT', 'FLUGHAFEN', 'LUFTHAVN',
    'INTERNATIONAL', 'TERMINAL', 'INTL'
];

// Helper Functions
function createEmptyEntry(slNo: string = '1'): PassportEntry {
    return {
        Sl_no: slNo,
        Country: '',
        Airport_Name_with_location: '',
        Arrival_Departure: '',
        Date: '',
        Description: '',
        isManualEntry: true,
        confidence: 0
    };
}

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
    'GENÈVE': 'Switzerland'
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
             const airportNameMatch = codes.find(code => combinedText.includes(code))
            if(airportNameMatch){
                return {
                    airport: airportNameMatch.toUpperCase().includes('AIRPORT')? airportNameMatch.toUpperCase(): `${airportNameMatch.toUpperCase()} AIRPORT`,
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

function defaultAirport(country: string): { airport: string; confidence: number } {
    if (country === 'India') {
        return {
            airport: 'Chhatrapati Shivaji International Airport',
            confidence: 0.5
        };
    }
    return {
        airport: 'Unknown International Airport',
        confidence: 0.3
    };
}

function detectStampType(text: string): 'ARRIVAL' | 'DEPARTURE' {
        const normalizedText = normalizeText(text);
        
        const arrivalKeywords = ['ARRIVAL', 'IMMIGRATION IN', 'ENTRY', 'ADMITTED', 'ENTRADA', 'IN', 'ENTRÉE', 'EINREISE'];
        const departureKeywords = ['DEPARTURE', 'IMMIGRATION OUT', 'EXIT', 'LEFT', 'SALIDA', 'OUT', 'SORTIE', 'AUSREISE', 'DEPARTED'];
    
      
        for(const keyword of departureKeywords){
            if (normalizedText.includes(keyword)) {
              return 'DEPARTURE';
            }
        }

    for (const keyword of arrivalKeywords) {
        if(normalizedText.includes(keyword)){
          return 'ARRIVAL';
        }
    }

   return 'ARRIVAL'
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

function parseStamp(textAnnotations: EntityAnnotation[]): PassportEntry[] {
    if (!textAnnotations?.length) {
        return [];
    }

    const text = textAnnotations[0]?.description || '';
    const blocks = text.split('\n').filter(block => block.trim().length > 0);
    const dateRegex = /(\d{1,2})[.\s/-](\d{1,2}|\w{3})[.\s/-](\d{2,4})/i;
        const dateRegex1 = /DD.MM.YY/;
    const entries: PassportEntry[] = [];
    let slNo = 1;
      for(let i =0; i< blocks.length; i++){
         const block = blocks[i];
         let dateMatch = block.match(dateRegex) || block.match(dateRegex1)
         if(dateMatch){
            const countryResult = detectCountry(text);
            const airportResult = detectAirport(blocks, countryResult.country);
            const descriptionBlocks: string[] = [];
          // collect the description
         for(let j = Math.max(0,i - 3); j< Math.min(blocks.length, i + 3); j++){
             descriptionBlocks.push(blocks[j]);
         }
          const description = descriptionBlocks.join('\n');
       
          entries.push({
                Sl_no: slNo.toString(),
                Country: countryResult.country,
                Airport_Name_with_location: airportResult.airport,
                Arrival_Departure: detectStampType(description),
                 Date: dateMatch? formatDate(block): "",
               Description: description,
              confidence: Math.min(countryResult.confidence, airportResult.confidence),
              });
              slNo++;
         }
    }

    return entries.length > 0 ? entries: [];
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
             const parsedData = parseStamp(result.textAnnotations || []);
            fs.unlinkSync(imagePath);
           res.status(200).json(parsedData);
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
                const passportEntry = new Passport({
                    Sl_no: entry[0],
                    Country: entry[1],
                    Airport_Name_with_location: entry[2],
                    Arrival_Departure: entry[3],
                    Date: entry[4],
                    Description: entry[5],
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