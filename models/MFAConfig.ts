import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMFAConfig extends Document {
  userId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  totpSecret: string;
  backupCodes: string[]; // Hashed backup codes
  isEnabled: boolean;
  enabledAt?: Date;
  lastUsedCounter?: number; // Replay attack prevention: last used TOTP counter
  createdAt: Date;
  updatedAt: Date;
}

const MFAConfigSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    totpSecret: {
      type: String,
      required: true,
      select: false,
    },
    backupCodes: {
      type: [String],
      default: [],
      select: false,
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    enabledAt: {
      type: Date,
    },
    lastUsedCounter: {
      type: Number,
      select: false,
    },
  },
  { timestamps: true }
);

// Compound unique: one MFA config per user per tenant
MFAConfigSchema.index({ userId: 1, tenantId: 1 }, { unique: true });

const MFAConfig: Model<IMFAConfig> =
  mongoose.models.MFAConfig || mongoose.model<IMFAConfig>('MFAConfig', MFAConfigSchema);

export default MFAConfig;
