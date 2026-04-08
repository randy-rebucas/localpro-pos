import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProductBatch extends Document {
  tenantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  supplierId?: mongoose.Types.ObjectId;
  batchNumber: string;
  lotNumber?: string;
  manufacturingDate?: Date;
  expiryDate?: Date;
  quantity: number;
  remainingQuantity: number;
  costPerUnit?: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Virtuals
  daysUntilExpiry?: number | null;
  isExpired?: boolean;
}

const ProductBatchSchema: Schema = new Schema(
  {
    tenantId:          { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true, index: true },
    productId:         { type: Schema.Types.ObjectId, ref: 'Product',  required: true, index: true },
    branchId:          { type: Schema.Types.ObjectId, ref: 'Branch',   index: true },
    supplierId:        { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
    batchNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    lotNumber: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    manufacturingDate: { type: Date },
    expiryDate:        { type: Date, index: true },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
    },
    remainingQuantity: {
      type: Number,
      required: true,
      min: [0, 'Remaining quantity cannot be negative'],
    },
    costPerUnit: {
      type: Number,
      min: [0, 'Cost per unit cannot be negative'],
    },
    notes:    { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Compound indexes ──────────────────────────────────────────────────────────

// Primary list query: tenant + product + active
ProductBatchSchema.index({ tenantId: 1, productId: 1, isActive: 1 });
// Expiry sweep: tenant + expiry date + active
ProductBatchSchema.index({ tenantId: 1, expiryDate: 1, isActive: 1 });
// Branch filter: tenant + branch + active
ProductBatchSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });
// Batch number uniqueness scoped to tenant (sparse = allow null)
ProductBatchSchema.index({ tenantId: 1, batchNumber: 1 }, { unique: true, sparse: true });

// ─── Virtuals ─────────────────────────────────────────────────────────────────

/** Whole days remaining until expiry (null if no expiry date) */
ProductBatchSchema.virtual('daysUntilExpiry').get(function (this: IProductBatch) {
  if (!this.expiryDate) return null;
  return Math.ceil((new Date(this.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
});

/** True if expiry date is in the past */
ProductBatchSchema.virtual('isExpired').get(function (this: IProductBatch) {
  if (!this.expiryDate) return false;
  return new Date(this.expiryDate) < new Date();
});

// ─── Pre-save validation ──────────────────────────────────────────────────────

ProductBatchSchema.pre('save', function (this: IProductBatch, next) {
  if ((this.remainingQuantity as number) > (this.quantity as number)) {
    return next(new Error('remainingQuantity cannot exceed quantity'));
  }
  if (this.manufacturingDate && this.expiryDate && this.expiryDate <= this.manufacturingDate) {
    return next(new Error('expiryDate must be after manufacturingDate'));
  }
  next();
});

const ProductBatch: Model<IProductBatch> =
  mongoose.models.ProductBatch || mongoose.model<IProductBatch>('ProductBatch', ProductBatchSchema);

export default ProductBatch;
