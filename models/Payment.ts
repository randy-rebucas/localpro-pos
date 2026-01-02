import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPaymentDetails {
  // Card payment details
  cardLast4?: string;
  cardType?: string;
  cardBrand?: string;
  // Digital payment details
  transactionId?: string;
  provider?: string; // e.g., 'stripe', 'paypal', 'square'
  // Cash payment details
  cashReceived?: number;
  change?: number;
  // Other payment details
  checkNumber?: string;
  notes?: string;
}

export interface IPayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  transactionId: mongoose.Types.ObjectId; // Reference to Order/Ticket
  method: 'cash' | 'card' | 'digital' | 'check' | 'other';
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  details?: IPaymentDetails;
  processedBy?: mongoose.Types.ObjectId; // Staff reference
  processedAt?: Date;
  refundedAt?: Date;
  refundReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentDetailsSchema: Schema = new Schema({
  cardLast4: String,
  cardType: String,
  cardBrand: String,
  transactionId: String,
  provider: String,
  cashReceived: Number,
  change: Number,
  checkNumber: String,
  notes: String,
}, { _id: false });

const PaymentSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'Transaction ID is required'],
      index: true,
    },
    method: {
      type: String,
      enum: ['cash', 'card', 'digital', 'check', 'other'],
      required: [true, 'Payment method is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    details: {
      type: PaymentDetailsSchema,
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    processedAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
    refundReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
PaymentSchema.index({ tenantId: 1, transactionId: 1 });
PaymentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ tenantId: 1, method: 1, createdAt: -1 });
PaymentSchema.index({ processedBy: 1, createdAt: -1 });

const Payment: Model<IPayment> = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);

export default Payment;
