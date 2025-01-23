import { Types } from 'mongoose';

export interface PassportEntry {
    Sl_no: string;
    Country: string;
    Airport_Name_with_location: string;
    Arrival_Departure: string;
    Date: string;
    Description: string;
    isManualEntry?: boolean;
}

export interface PassportEntryWithUser extends PassportEntry {
    user: Types.ObjectId;
}