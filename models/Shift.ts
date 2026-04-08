import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IShift extends Document {
  tenantId: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  date: Date; // Day of the shift (midnight UTC)
  startTime: string; // HH:mm (e.g. "08:00")
  endTime: string; // HH:mm (e.g. "17:00")
  role?: string;
  status: 'scheduled' | 'confirmed' | 'swap_requested' | 'covered' | 'absent' | 'completed';
  notes?: string;
  swapRequestedTo?: mongoose.Types.ObjectId; // Staff member the swap was requested to
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ShiftSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    date: { type: Date, required: true },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    role: { type: String },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'swap_requested', 'covered', 'absent', 'completed'],
      default: 'scheduled',
    },
    notes: { type: String, maxlength: 500 },
    swapRequestedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ShiftSchema.index({ tenantId: 1, date: 1 });
ShiftSchema.index({ tenantId: 1, staffId: 1, date: 1 });

const Shift: Model<IShift> = mongoose.models.Shift || mongoose.model<IShift>('Shift', ShiftSchema);

export default Shift;
