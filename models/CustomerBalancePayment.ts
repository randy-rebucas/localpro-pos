import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICustomerBalancePayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  amount: number;
  method: 'cash' | 'card' | 'digital' | 'check' | 'other';
  notes?: string;
  recordedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerBalancePaymentSchema: Schema = new Schema(
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
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0.01,
    },
    method: {
      type: String,
      enum: ['cash', 'card', 'digital', 'check', 'other'],
      required: [true, 'Payment method is required'],
    },
    notes: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
  },
  { timestamps: true }
);

CustomerBalancePaymentSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });

const CustomerBalancePayment: Model<ICustomerBalancePayment> =
  mongoose.models.CustomerBalancePayment ||
  mongoose.model<ICustomerBalancePayment>('CustomerBalancePayment', CustomerBalancePaymentSchema);

export default CustomerBalancePayment;
