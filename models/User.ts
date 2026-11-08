import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { invalidateUserCache } from '@/lib/cache';

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
      // Unique per tenant through the { tenantId, email } index below. This one
      // only serves lookups that have no tenant, such as super-admin login.
      index: true,
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
      // A sign-in credential: never part of a user listing. Read it only by
      // naming it (select('qrToken') / '+qrToken') where the caller may see it.
      select: false,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: function(this: IUser) { return this.role !== 'super_admin'; },
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
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

// Update queries skip pre('save'), so a password written through
// findOneAndUpdate/updateOne would be stored as typed (and login would then
// reject it). Hash it here too unless it already is a bcrypt hash.
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;
UserSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update || Array.isArray(update)) return;
  const $set = update.$set as Record<string, unknown> | undefined;
  for (const holder of [update, $set]) {
    const value = holder?.password;
    if (holder && typeof value === 'string' && !BCRYPT_HASH.test(value)) {
      holder.password = await bcrypt.hash(value, await bcrypt.genSalt(10));
    }
  }
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

// getCurrentUser caches each user's active flag/tenant (lib/cache.ts) — drop it
// on any write so deactivation and tenant moves apply immediately on this instance.
UserSchema.post('save', function (doc: IUser) {
  invalidateUserCache(String(doc._id));
});
UserSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany'],
  () => invalidateUserCache()
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;

