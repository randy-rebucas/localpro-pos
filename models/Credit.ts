import mongoose, { Schema, Document, Model } from 'mongoose';

export type CreditTransactionType = 'top_up' | 'usage' | 'refund' | 'adjustment';

export interface ICredit extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  type: CreditTransactionType;
  amount: number; // Amount of credits involved
  balanceBefore: number; // Customer's balance before this transaction
  balanceAfter: number; // Customer's balance after this transaction
  reason?: string; // Reason for adjustment/refund
  transactionId?: mongoose.Types.ObjectId; // Reference to Transaction if credits were used for purchase
  createdBy?: mongoose.Types.ObjectId; // User ID who created this (for admin adjustments)
  createdAt: Date;
  updatedAt: Date;
}

const CreditSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['top_up', 'usage', 'refund', 'adjustment'],
      required: [true, 'Credit type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    balanceBefore: {
      type: Number,
      required: [true, 'Balance before is required'],
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: [true, 'Balance after is required'],
      min: 0,
    },
    reason: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
CreditSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
CreditSchema.index({ tenantId: 1, type: 1 });
CreditSchema.index({ transactionId: 1 }, { sparse: true });

const Credit: Model<ICredit> = mongoose.models.Credit || mongoose.model<ICredit>('Credit', CreditSchema);

export default Credit;
