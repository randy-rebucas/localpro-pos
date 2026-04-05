import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAccountsReceivable extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  transactionId: mongoose.Types.ObjectId; // Reference to the original Transaction
  originalAmount: number; // Total sale amount at time of invoice
  paidAmount: number; // Amount paid so far (default 0)
  outstandingAmount: number; // originalAmount - paidAmount
  dueDate: Date; // When payment is due
  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  notes?: string; // Additional details (e.g., customer agreement notes)
  createdBy?: mongoose.Types.ObjectId; // User who created the receivable
  invoiceNumber?: string; // Optional invoice reference
  tags?: string[]; // For categorization/filtering
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AccountsReceivableSchema: Schema = new Schema(
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
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'Transaction ID is required'],
      unique: true, // One receivable per transaction
      sparse: true,
    },
    originalAmount: {
      type: Number,
      required: [true, 'Original amount is required'],
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingAmount: {
      type: Number,
      required: [true, 'Outstanding amount is required'],
      min: 0,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'],
      default: 'pending',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    invoiceNumber: {
      type: String,
      trim: true,
      sparse: true,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
AccountsReceivableSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
AccountsReceivableSchema.index({ tenantId: 1, paymentStatus: 1, dueDate: 1 });
AccountsReceivableSchema.index({ tenantId: 1, dueDate: 1 }); // For aging analysis
AccountsReceivableSchema.index({ tenantId: 1, isActive: 1, paymentStatus: 1 });

const AccountsReceivable: Model<IAccountsReceivable> = mongoose.models.AccountsReceivable || mongoose.model<IAccountsReceivable>('AccountsReceivable', AccountsReceivableSchema);

export default AccountsReceivable;
