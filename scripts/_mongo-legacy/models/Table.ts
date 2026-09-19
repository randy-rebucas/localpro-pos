import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITable extends Document {
  tenantId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  name: string; // e.g. "T1", "5A", "Bar 3"
  capacity?: number;
  status: 'open' | 'occupied' | 'check-requested';
  currentOrderId?: mongoose.Types.ObjectId; // Transaction in progress
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TableSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Table name is required'],
      trim: true,
    },
    capacity: {
      type: Number,
      min: 1,
    },
    status: {
      type: String,
      enum: ['open', 'occupied', 'check-requested'],
      default: 'open',
    },
    currentOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

TableSchema.index({ tenantId: 1, isActive: 1, status: 1 });
TableSchema.index({ tenantId: 1, name: 1 }, { unique: true, sparse: false });

const Table: Model<ITable> = mongoose.models.Table || mongoose.model<ITable>('Table', TableSchema);

export default Table;
