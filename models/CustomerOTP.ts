import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICustomerOTP extends Document {
  tenantId: mongoose.Types.ObjectId;
  phone: string;
  otp: string;
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  createdAt: Date;
}

const CustomerOTPSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: [true, 'OTP is required'],
      length: 6,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired OTPs
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
      max: 5, // Max 5 verification attempts
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for tenant + phone lookups
CustomerOTPSchema.index({ tenantId: 1, phone: 1 });
CustomerOTPSchema.index({ tenantId: 1, phone: 1, verified: 1 });

// Auto-delete expired OTPs
CustomerOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CustomerOTP: Model<ICustomerOTP> = 
  mongoose.models.CustomerOTP || mongoose.model<ICustomerOTP>('CustomerOTP', CustomerOTPSchema);

export default CustomerOTP;
