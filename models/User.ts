import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer' | 'super_admin';
  tenantId?: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId; // Branch assignment (optional)
  isActive: boolean;
  lastLogin?: Date;
  qrToken?: string; // Unique token for QR code login
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
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
      enum: ['owner', 'admin', 'manager', 'cashier', 'viewer', 'super_admin'],
      default: 'cashier',
      required: true,
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
      required: function(this: IUser) { return this.role !== 'super_admin'; },
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
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
      return next(error as Error);
    }
  }
  
  // Generate cryptographically secure QR token if not exists
  if (this.isNew && !this.qrToken) {
    this.qrToken = crypto.randomBytes(32).toString('hex');
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

// Compound index for tenant and email
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// Index for tenant and role queries
UserSchema.index({ tenantId: 1, role: 1, isActive: 1 });
// Index for branch assignment queries
UserSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;

