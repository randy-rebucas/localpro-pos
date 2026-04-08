import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISupplier extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  leadTimeDays: number; // Average days from order to delivery
  paymentTerms?: string; // e.g. "Net 30", "COD"
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    contactName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    leadTimeDays: { type: Number, default: 7, min: 0 },
    paymentTerms: { type: String, trim: true },
    notes: { type: String, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SupplierSchema.index({ tenantId: 1, isActive: 1 });

const Supplier: Model<ISupplier> =
  mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema);

export default Supplier;
