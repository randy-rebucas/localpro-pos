import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPrescriptionItem {
  productId?: mongoose.Types.ObjectId;
  drugName: string;
  quantity: number;
  dosage: string;
  frequency: string;
  instructions?: string;
  dispensed: boolean;
  dispensedAt?: Date;
  dispensedBy?: mongoose.Types.ObjectId;
  dispensedTransactionId?: mongoose.Types.ObjectId;
}

export interface IPrescription extends Document {
  tenantId: mongoose.Types.ObjectId;
  prescriptionNumber: string; // auto-gen "RX-YYYY-NNNNNN"
  patientName: string;
  patientAge?: number;
  doctorName: string;
  doctorPRCNumber: string;
  doctorClinic?: string;
  issuedDate: Date;
  validUntil: Date;
  items: IPrescriptionItem[];
  transactionId?: mongoose.Types.ObjectId;
  status: 'pending' | 'partially_dispensed' | 'dispensed' | 'expired' | 'cancelled';
  notes?: string;
  scannedCopy?: string; // URL to uploaded prescription scan
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionItemSchema: Schema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  drugName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  dosage: { type: String, required: true, trim: true },
  frequency: { type: String, required: true, trim: true },
  instructions: { type: String, trim: true },
  dispensed: { type: Boolean, default: false },
  dispensedAt: { type: Date },
  dispensedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  dispensedTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
}, { _id: false });

const PrescriptionSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    prescriptionNumber: {
      type: String,
      required: true,
      trim: true,
    },
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
    },
    patientAge: { type: Number, min: 0 },
    doctorName: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true,
    },
    doctorPRCNumber: {
      type: String,
      required: [true, 'Doctor PRC number is required'],
      trim: true,
    },
    doctorClinic: { type: String, trim: true },
    issuedDate: {
      type: Date,
      required: [true, 'Issued date is required'],
    },
    validUntil: {
      type: Date,
      required: [true, 'Valid until date is required'],
    },
    items: {
      type: [PrescriptionItemSchema],
      required: true,
      validate: {
        validator: (items: IPrescriptionItem[]) => items.length > 0,
        message: 'Prescription must have at least one item',
      },
    },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    status: {
      type: String,
      enum: ['pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'],
      default: 'pending',
    },
    notes: { type: String, trim: true },
    scannedCopy: { type: String },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

PrescriptionSchema.index({ tenantId: 1, createdAt: -1 });
PrescriptionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
PrescriptionSchema.index({ tenantId: 1, prescriptionNumber: 1 }, { unique: true });
PrescriptionSchema.index({ tenantId: 1, validUntil: 1 });
PrescriptionSchema.index({ tenantId: 1, patientName: 'text' });

const Prescription: Model<IPrescription> =
  mongoose.models.Prescription ||
  mongoose.model<IPrescription>('Prescription', PrescriptionSchema);

export default Prescription;
