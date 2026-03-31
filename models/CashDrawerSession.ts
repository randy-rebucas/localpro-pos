import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICashDrawerSession extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  openingTime: Date;
  closingTime?: Date;
  status: 'open' | 'closed';
  notes?: string;
  totalVAT?: number;
  totalDiscounts?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CashDrawerSessionSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    openingAmount: {
      type: Number,
      required: [true, 'Opening amount is required'],
      min: 0,
    },
    closingAmount: {
      type: Number,
      min: 0,
    },
    expectedAmount: {
      type: Number,
      min: 0,
    },
    shortage: {
      type: Number,
      min: 0,
    },
    overage: {
      type: Number,
      min: 0,
    },
    openingTime: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    closingTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    totalVAT: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalDiscounts: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
CashDrawerSessionSchema.index({ tenantId: 1, status: 1 });
CashDrawerSessionSchema.index({ tenantId: 1, openingTime: -1 });
// Enforce only one open session per tenant (partial unique index)
CashDrawerSessionSchema.index(
  { tenantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

const CashDrawerSession: Model<ICashDrawerSession> = 
  mongoose.models.CashDrawerSession || 
  mongoose.model<ICashDrawerSession>('CashDrawerSession', CashDrawerSessionSchema);

export default CashDrawerSession;

