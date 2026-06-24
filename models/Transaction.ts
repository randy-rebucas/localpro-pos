import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransactionItemModifier {
  name: string;       // e.g. "Temperature"
  chosenOption: string; // e.g. "Medium Rare"
  price: number;       // 0 for free options
}

export interface ITransactionItem {
  product: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  modifiers?: ITransactionItemModifier[];
  prescriptionId?: mongoose.Types.ObjectId; // Pharmacy: links Rx item to prescription
}

export interface ISplitPayment {
  guestIndex: number;
  method: string;
  amount: number;
  reference?: string;
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
  paymentMethod: 'cash' | 'card' | 'digital' | 'tap_to_pay' | 'wallet' | 'qr_code' | 'bnpl' | 'on_account';
  paymentProvider?: string; // e.g. 'gcash', 'maya', 'applepay', 'billease', 'qrph'
  paymentReference?: string; // Reference/transaction ID from the payment provider
  bnplInstallments?: number; // Number of installments for BNPL
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  customerId?: mongoose.Types.ObjectId;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  userId?: mongoose.Types.ObjectId;
  receiptNumber?: string;
  notes?: string;
  displayCurrency?: string; // Currency code the customer chose to view the total in
  displayTotal?: number;    // Total converted to displayCurrency at time of sale
  // Restaurant-specific
  orderType?: 'dine-in' | 'takeout' | 'delivery';
  tableNumber?: string;
  tableId?: mongoose.Types.ObjectId;
  // Split billing
  splitCount?: number;
  splitPayments?: ISplitPayment[];
  /** Origin channel for imported online orders */
  salesChannel?: 'pos' | 'shopify' | 'woocommerce';
  /** External order id from Shopify/WooCommerce */
  externalOrderId?: string;
  /** `${provider}:${externalOrderId}` for idempotent unique index */
  channelSyncKey?: string;
  channelImportedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionItemModifierSchema: Schema = new Schema({
  name: { type: String, required: true },
  chosenOption: { type: String, required: true },
  price: { type: Number, required: true, default: 0 },
}, { _id: false });

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
  modifiers: {
    type: [TransactionItemModifierSchema],
    default: undefined,
  },
  prescriptionId: {
    type: Schema.Types.ObjectId,
    ref: 'Prescription',
  },
});

const SplitPaymentSchema: Schema = new Schema({
  guestIndex: { type: Number, required: true },
  method: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  reference: { type: String, trim: true },
}, { _id: false });

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
      enum: ['cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'on_account'],
      required: true,
    },
    paymentProvider: {
      type: String,
      trim: true,
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    bnplInstallments: {
      type: Number,
      min: 1,
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
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
    },
    loyaltyPointsEarned: {
      type: Number,
      min: 0,
    },
    loyaltyPointsRedeemed: {
      type: Number,
      min: 0,
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
    displayCurrency: {
      type: String,
      trim: true,
    },
    displayTotal: {
      type: Number,
      min: 0,
    },
    // Restaurant-specific
    orderType: {
      type: String,
      enum: ['dine-in', 'takeout', 'delivery'],
    },
    tableNumber: {
      type: String,
      trim: true,
    },
    tableId: {
      type: Schema.Types.ObjectId,
      ref: 'Table',
    },
    // Split billing
    splitCount: {
      type: Number,
      min: 2,
    },
    splitPayments: {
      type: [SplitPaymentSchema],
      default: undefined,
    },
    salesChannel: {
      type: String,
      enum: ['pos', 'shopify', 'woocommerce'],
    },
    externalOrderId: {
      type: String,
      trim: true,
    },
    channelSyncKey: {
      type: String,
      trim: true,
    },
    channelImportedAt: {
      type: Date,
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

// Compound indexes
TransactionSchema.index({ tenantId: 1, createdAt: -1 });
TransactionSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
TransactionSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ tenantId: 1, status: 1 });
TransactionSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });
TransactionSchema.index(
  { tenantId: 1, channelSyncKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      channelSyncKey: { $exists: true, $type: 'string', $gt: '' },
    },
  }
);

const Transaction: Model<ITransaction> = mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;

