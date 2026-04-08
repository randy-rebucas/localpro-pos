import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IApiKey extends Document {
  name: string;
  keyHash: string; // SHA-256 hash of the actual key
  keyPrefix: string; // First 8 chars for identification (e.g. "sk_live_")
  permissions: string[]; // e.g. ['transactions:read', 'products:write']
  tenantId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
      select: false, // Never return key hash
    },
    keyPrefix: {
      type: String,
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastUsedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }, // TTL index
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

ApiKeySchema.index({ tenantId: 1, isActive: 1 });

const ApiKey: Model<IApiKey> =
  mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

export default ApiKey;
