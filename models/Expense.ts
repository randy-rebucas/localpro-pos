import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExpense extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  amount: number;
  date: Date;
  paymentMethod: 'cash' | 'card' | 'digital' | 'other';
  receipt?: string; // URL or reference to receipt
  notes?: string;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'digital', 'other'],
      required: true,
    },
    receipt: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
ExpenseSchema.index({ tenantId: 1, date: -1 });
ExpenseSchema.index({ tenantId: 1, name: 1 });

const Expense: Model<IExpense> = mongoose.models.Expense || mongoose.model<IExpense>('Expense', ExpenseSchema);

export default Expense;

