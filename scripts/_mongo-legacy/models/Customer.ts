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
  },
  {
    timestamps: true,
  }
);

// Compound indexes
CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ tenantId: 1, phone: 1 }, { sparse: true });
CustomerSchema.index({ tenantId: 1, isActive: 1 });
CustomerSchema.index({ tenantId: 1, shopifyCustomerId: 1 }, { sparse: true });
CustomerSchema.index({ tenantId: 1, tags: 1 });

// Virtual for full name
CustomerSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

const Customer: Model<ICustomer> = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);

export default Customer;
