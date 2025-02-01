import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPassport extends Document {
  Sl_no?: string;
  Country: string;
  Airport_Name_with_location: string;
  Arrival_Departure: string;
  Date: string;
  Description?: string;
  user: Types.ObjectId;
}

const PassportSchema = new Schema({
    Sl_no: { type: String, required: false },
    Country: { type: String, required: true },
    Airport_Name_with_location: { type: String, required: true },
    Arrival_Departure: { type: String, required: true },
    Date: { type: String, required: true },
    Description: { type: String, required: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });


export default mongoose.model<IPassport>('Passport', PassportSchema);