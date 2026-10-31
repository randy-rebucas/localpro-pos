import mongoose, { Schema, Document, Model } from 'mongoose';
import type { CustomerAddress } from '@/types/customer';

/** Mongoose subdocument — same shape as `CustomerAddress` in `@/types/customer`. */
export type ICustomerAddress = CustomerAddress;

export interface ICustomer extends Document {
  tenantId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  addresses?: CustomerAddress[];
  dateOfBirth?: Date;
  notes?: string;
  tags?: string[]; // For categorization (e.g., "VIP", "Regular", "Wholesale")
  totalSpent?: number; // Total amount spent (calculated)
  lastPurchaseDate?: Date;
  loyaltyPointsBalance?: number;
  /** Amount the customer owes the tenant (on-account / pay later). */
  accountBalance?: number;
  /** Max allowed accountBalance after a sale; omit for no limit. */
  creditLimit?: number;
  shopifyCustomerId?: string;
  isActive: boolean;
  deactivatedAt?: Date;
  anonymizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerAddressSchema: Schema = new Schema({
  street: String,
  city: String,
  state: String,
  zipCode: String,
  country: String,
  isDefault: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const CustomerSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      trim: true,
    },
    addresses: {
      type: [CustomerAddressSchema],
      default: [],
    },
    dateOfBirth: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    totalSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastPurchaseDate: {
      type: Date,
    },
    loyaltyPointsBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    accountBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditLimit: {
      type: Number,
      min: 0,
    },
    shopifyCustomerId: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Set when the customer is deactivated (soft-deleted); starts the retention
    // clock for lib/automations/customer-data-retention.ts.
    deactivatedAt: {
      type: Date,
    },
    // Set once personal data has been removed by the retention job.
    anonymizedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

CustomerSchema.pre('save', function (next) {
  if (this.isModified('isActive')) {
    this.set('deactivatedAt', this.get('isActive') === false ? new Date() : undefined);
  }
  next();
});

// Per-tenant email uniqueness. `sparse` has no effect on a compound index whose
// tenantId is always present (missing email is indexed as null, so a tenant could
// only ever have one email-less customer). Partial index on non-empty strings only.
CustomerSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $gt: '' } } }
);
// OTP login lookup by phone (verify-otp). Skips customers without a phone.
CustomerSchema.index(
  { tenantId: 1, phone: 1 },
  { partialFilterExpression: { phone: { $gt: '' } } }
);
// Customer list: newest first, paginated. The UI's default view sends no isActive
// filter, so isActive must not sit between tenantId and createdAt (that forced an
// in-memory sort of every tenant customer). isActive is filtered on fetch instead.
CustomerSchema.index({ tenantId: 1, createdAt: -1 });

// Virtual for full name
CustomerSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

const Customer: Model<ICustomer> = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);

export default Customer;
