import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICommission extends Document {
  tenantId: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  transactionId: mongoose.Types.ObjectId;
  ruleId: mongoose.Types.ObjectId;
  amount: number;
  rate: number;
  saleAmount: number; // Transaction total that the commission was based on
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  period: string; // e.g. "2026-04" (YYYY-MM)
  paidAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'CommissionRule', required: true },
    amount: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true },
    saleAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paid', 'rejected'],
      default: 'pending',
    },
    period: { type: String, required: true, index: true }, // YYYY-MM
    paidAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

CommissionSchema.index({ tenantId: 1, staffId: 1, period: 1 });
CommissionSchema.index({ tenantId: 1, status: 1 });

const Commission: Model<ICommission> =
  mongoose.models.Commission || mongoose.model<ICommission>('Commission', CommissionSchema);

export default Commission;
