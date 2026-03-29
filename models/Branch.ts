import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBranch extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code?: string; // Unique code for the branch (e.g., "BR001")
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  managerId?: mongoose.Types.ObjectId; // Reference to User
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    phone: String,
    email: String,
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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

// Compound index for tenant-scoped unique branch code
BranchSchema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });
BranchSchema.index({ tenantId: 1, isActive: 1 });

const Branch: Model<IBranch> = mongoose.models.Branch || mongoose.model<IBranch>('Branch', BranchSchema);

export default Branch;

