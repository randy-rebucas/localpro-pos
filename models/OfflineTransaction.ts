import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOfflineTransactionItem {
  productId?: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface IOfflineTransaction extends Document {
  tenantId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  deviceId: string; // Identifies which offline device created this
  items: IOfflineTransactionItem[];
  subtotal: number;
  discountCode?: string;
  discountCategory?: 'general' | 'senior' | 'pwd' | 'employee' | 'promo';
  discountAmount?: number;
  taxExemptAmount?: number;
  taxAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  customerId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  notes?: string;
  offlineCreatedAt: Date; // When the transaction was created on the device
  syncStatus: 'pending' | 'processing' | 'synced' | 'failed';
  syncedTransactionId?: mongoose.Types.ObjectId; // Reference to created Transaction after sync
  retryCount: number;
  syncError?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OfflineTransactionItemSchema: Schema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
});

const OfflineTransactionSchema: Schema = new Schema(
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
    deviceId: {
      type: String,
      required: [true, 'Device ID is required'],
      trim: true,
    },
    items: {
      type: [OfflineTransactionItemSchema],
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    discountCategory: {
      type: String,
      enum: ['general', 'senior', 'pwd', 'employee', 'promo'],
    },
    discountAmount: {
      type: Number,
      min: 0,
    },
    taxExemptAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    taxAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'digital'],
      required: true,
    },
    cashReceived: {
      type: Number,
      min: 0,
    },
    change: {
      type: Number,
      min: 0,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
    },
    offlineCreatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    syncStatus: {
      type: String,
      enum: ['pending', 'processing', 'synced', 'failed'],
      default: 'pending',
      index: true,
    },
    syncedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    syncError: {
      type: String,
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

OfflineTransactionSchema.index({ tenantId: 1, syncStatus: 1 });
OfflineTransactionSchema.index({ tenantId: 1, deviceId: 1, offlineCreatedAt: -1 });
OfflineTransactionSchema.index({ tenantId: 1, createdAt: -1 });

const OfflineTransaction: Model<IOfflineTransaction> =
  mongoose.models.OfflineTransaction ||
  mongoose.model<IOfflineTransaction>('OfflineTransaction', OfflineTransactionSchema);

export default OfflineTransaction;
