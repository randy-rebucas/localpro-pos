import mongoose, { Schema, Document, Model } from 'mongoose';

export type LoyaltyTransactionType = 'earn' | 'redeem' | 'adjust';

export interface ILoyaltyTransaction extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  transactionId?: mongoose.Types.ObjectId;
  type: LoyaltyTransactionType;
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LoyaltyTransactionSchema: Schema = new Schema(
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
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    type: {
      type: String,
      enum: ['earn', 'redeem', 'adjust'],
      required: [true, 'Transaction type is required'],
    },
    points: {
      type: Number,
      required: [true, 'Points value is required'],
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: [0, 'Balance cannot be negative'],
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: [0, 'Balance cannot be negative'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

LoyaltyTransactionSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
LoyaltyTransactionSchema.index({ tenantId: 1, transactionId: 1 });

const LoyaltyTransaction: Model<ILoyaltyTransaction> =
  mongoose.models.LoyaltyTransaction ||
  mongoose.model<ILoyaltyTransaction>('LoyaltyTransaction', LoyaltyTransactionSchema);

export default LoyaltyTransaction;
