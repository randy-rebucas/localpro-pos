import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInvoice extends Document {
  tenantId: mongoose.Types.ObjectId;
  invoiceNumber: string; // Unique identifier (format: INV-YYYYMMDD-XXXXX)
  transactionId?: mongoose.Types.ObjectId; // Reference to Order/Ticket (if applicable)
  customerId?: mongoose.Types.ObjectId; // Reference to Customer (for B2B)
  customerInfo?: {
    name: string;
    email?: string;
    phone?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
  }; // Snapshot of customer info at invoice creation
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    price: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  taxAmount: number;
  total: number;
  dueDate: Date;
  paymentTerms?: string; // e.g., "Net 30", "Due on receipt"
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  paidAt?: Date;
  paidAmount?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: String,
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const CustomerInfoSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
  },
}, { _id: false });

const InvoiceSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      index: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    customerInfo: {
      type: CustomerInfoSchema,
    },
    items: {
      type: [InvoiceItemSchema],
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      min: 0,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paymentTerms: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
    },
    paidAt: {
      type: Date,
    },
    paidAmount: {
      type: Number,
      min: 0,
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
InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
InvoiceSchema.index({ tenantId: 1, customerId: 1 });
InvoiceSchema.index({ tenantId: 1, transactionId: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 }); // For overdue queries

const Invoice: Model<IInvoice> = mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

export default Invoice;
