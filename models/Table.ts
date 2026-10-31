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

// Table names are unique per branch (two branches can each have "Table 1"); tables with no
// branchId index as null and stay unique among themselves. Also serves the table list
// ({ tenantId, [branchId], [isActive], [status] } sorted by name): fully when branchId is
// filtered; for tenant-wide lists the tenantId prefix bounds the scan and the sort is done in
// memory — per-tenant table counts are tiny, so no separate {tenantId, name} index.
TableSchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

const Table: Model<ITable> = mongoose.models.Table || mongoose.model<ITable>('Table', TableSchema);

export default Table;
