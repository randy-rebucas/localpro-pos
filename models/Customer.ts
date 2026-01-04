import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface ICustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isDefault?: boolean;
}

export interface ICustomer extends Document {
  tenantId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  password?: string; // For email/password authentication
  facebookId?: string; // For Facebook authentication
  addresses?: ICustomerAddress[];
  dateOfBirth?: Date;
  notes?: string;
  tags?: string[]; // For categorization (e.g., "VIP", "Regular", "Wholesale")
  totalSpent?: number; // Total amount spent (calculated)
  lastPurchaseDate?: Date;
  lastLogin?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
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
      required: false, // Optional for mobile customers
      index: true,
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
    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't return password by default
    },
    facebookId: {
      type: String,
      index: true,
      sparse: true, // Allow null values but enforce uniqueness when present
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
    lastLogin: {
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

// Hash password before saving
CustomerSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      const password = this.password as string;
      this.password = await bcrypt.hash(password, salt);
    } catch (error: unknown) {
      return next(error);
    }
  }
  next();
});

// Method to compare password
CustomerSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Compound indexes (sparse to allow null tenantId)
CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ tenantId: 1, phone: 1 }, { sparse: true });
CustomerSchema.index({ tenantId: 1, facebookId: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ tenantId: 1, isActive: 1 }, { sparse: true });
CustomerSchema.index({ tenantId: 1, tags: 1 }, { sparse: true });

// Virtual for full name
CustomerSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

const Customer: Model<ICustomer> = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);

export default Customer;
