import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * BIR Z-Reading: an immutable, once-per-business-day end-of-day sales report.
 * Captures the Grand Total accumulator snapshot (beginning/ending) so the day's
 * gross sales can always be reconciled against the non-resettable GT register.
 */
export interface IZReading extends Document {
  tenantId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  businessDate: Date; // normalized to local midnight of the reporting day
  beginningGT: number;
  endingGT: number;
  grossSales: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  discountTotal: number;
  transactionCount: number;
  voidCount: number;
  generatedBy: mongoose.Types.ObjectId;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ZReadingSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
    },
    businessDate: {
      type: Date,
      required: true,
    },
    beginningGT: {
      type: Number,
      required: true,
      min: 0,
    },
    endingGT: {
      type: Number,
      required: true,
      min: 0,
    },
    grossSales: {
      type: Number,
      required: true,
      min: 0,
    },
    vatableSales: {
      type: Number,
      default: 0,
      min: 0,
    },
    vatAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    vatExemptSales: {
      type: Number,
      default: 0,
      min: 0,
    },
    zeroRatedSales: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    voidCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// A tenant (optionally scoped per branch) can only generate one Z-Reading per business day.
ZReadingSchema.index({ tenantId: 1, branchId: 1, businessDate: 1 }, { unique: true });
ZReadingSchema.index({ tenantId: 1, businessDate: -1 });

const ZReading: Model<IZReading> =
  mongoose.models.ZReading || mongoose.model<IZReading>('ZReading', ZReadingSchema);

export default ZReading;
