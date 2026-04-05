import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPaymentRecord extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  receivableId: mongoose.Types.ObjectId; // Reference to AccountsReceivable
  transactionId?: mongoose.Types.ObjectId; // Optional reference to payment transaction (if paid-in checkout)
  amount: number; // Amount paid
  paymentMethod: 'cash' | 'card' | 'digital' | 'check' | 'transfer' | 'other';
  reference?: string; // Check number, transfer ref, etc.
  notes?: string;
  processedBy?: mongoose.Types.ObjectId; // User who recorded the payment
  processedAt: Date; // When payment was received
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentRecordSchema: Schema = new Schema(
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
    receivableId: {
      type: Schema.Types.ObjectId,
      ref: 'AccountsReceivable',
      required: [true, 'Receivable ID is required'],
      index: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      sparse: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'digital', 'check', 'transfer', 'other'],
      required: [true, 'Payment method is required'],
    },
    reference: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    processedAt: {
      type: Date,
      required: [true, 'Processing date is required'],
      default: () => new Date(),
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

// Compound indexes for efficient querying
PaymentRecordSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
PaymentRecordSchema.index({ tenantId: 1, receivableId: 1 });
PaymentRecordSchema.index({ tenantId: 1, processedAt: -1 });
PaymentRecordSchema.index({ tenantId: 1, paymentMethod: 1 });

const PaymentRecord: Model<IPaymentRecord> = mongoose.models.PaymentRecord || mongoose.model<IPaymentRecord>('PaymentRecord', PaymentRecordSchema);

export default PaymentRecord;
