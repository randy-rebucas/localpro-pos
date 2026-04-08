import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProductBatch extends Document {
  tenantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  supplierId?: mongoose.Types.ObjectId;
  batchNumber: string; // Internal batch reference
  lotNumber?: string; // Supplier lot number
  manufacturingDate?: Date;
  expiryDate?: Date;
  quantity: number;
  remainingQuantity: number;
  costPerUnit?: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductBatchSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    batchNumber: { type: String, required: true, trim: true },
    lotNumber: { type: String, trim: true },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date, index: true },
    quantity: { type: Number, required: true, min: 0 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    costPerUnit: { type: Number, min: 0 },
    notes: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProductBatchSchema.index({ tenantId: 1, productId: 1, isActive: 1 });
ProductBatchSchema.index({ tenantId: 1, expiryDate: 1, isActive: 1 });
ProductBatchSchema.index({ tenantId: 1, batchNumber: 1 }, { unique: true, sparse: true });

const ProductBatch: Model<IProductBatch> =
  mongoose.models.ProductBatch || mongoose.model<IProductBatch>('ProductBatch', ProductBatchSchema);

export default ProductBatch;
