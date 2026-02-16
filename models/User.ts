import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
  tenantId: mongoose.Types.ObjectId;
  isActive: boolean;
  lastLogin?: Date;
  pin?: string; // Hashed PIN for quick login
  qrToken?: string; // Unique token for QR code login
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  comparePIN(candidatePIN: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't return password by default
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'cashier', 'viewer'],
      default: 'cashier',
      required: true,
    },
    pin: {
      type: String,
      minlength: [4, 'PIN must be at least 4 digits'],
      maxlength: [8, 'PIN must be at most 8 digits'],
      select: false, // Don't return PIN by default
    },
    qrToken: {
      type: String,
      unique: true,
      sparse: true, // Allow null values but enforce uniqueness when present
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      const password = this.password as string;
      this.password = await bcrypt.hash(password, salt);
    } catch (error: unknown) {
      return next(error);
    }
  }
  
  // Hash PIN before saving
  if (this.isModified('pin') && this.pin) {
    try {
      const salt = await bcrypt.genSalt(10);
      const pin = this.pin as string;
      this.pin = await bcrypt.hash(pin, salt);
    } catch (error: unknown) {
      return next(error);
    }
  }
  
  // Generate QR token if not exists
  if (this.isNew && !this.qrToken) {
    const id = (this._id as mongoose.Types.ObjectId).toString();
    this.qrToken = id + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
  }
  
  next();
});

// Method to compare password
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    throw new Error('Password not available for comparison');
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to compare PIN
UserSchema.methods.comparePIN = async function (candidatePIN: string): Promise<boolean> {
  if (!this.pin) {
    return false;
  }
  return bcrypt.compare(candidatePIN, this.pin);
};

// Compound index for tenant and email
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// Index for tenant and role queries
UserSchema.index({ tenantId: 1, role: 1, isActive: 1 });

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;

