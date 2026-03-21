import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransactionItem {
  product: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface ITransaction extends Document {
  tenantId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId; // Branch/location reference
  items: ITransactionItem[];
  subtotal: number; // Total before discount
  discountCode?: string;
  discountCategory?: 'general' | 'senior' | 'pwd' | 'employee' | 'promo';
  discountAmount?: number;
  taxExemptAmount?: number; // Amount exempt from VAT (BIR)
  taxAmount?: number; // Calculated tax amount
  total: number; // Total after discount and tax
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  userId?: mongoose.Types.ObjectId;
  receiptNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionItemSchema: Schema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: false, // optional for manual/custom transactions
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  subtotal: {
    type: Number,
    required: true,
  },
});

const TransactionSchema: Schema = new Schema(
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
    items: {
      type: [TransactionItemSchema],
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
    status: {
      type: String,
      enum: ['completed', 'cancelled', 'refunded'],
      default: 'completed',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    receiptNumber: {
      type: String,
      // unique enforced via compound index { tenantId, receiptNumber } below
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
TransactionSchema.index({ tenantId: 1, createdAt: -1 });
TransactionSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
TransactionSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ tenantId: 1, status: 1 });

const Transaction: Model<ITransaction> = mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;

