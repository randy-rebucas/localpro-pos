import crypto from 'node:crypto';
import mongoose, { Schema, Document, Model } from 'mongoose';

/** Maximum verification attempts (correct or not) allowed per issued OTP. */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * HMAC-SHA256 hex digest of an OTP code, keyed with a server secret so a leaked
 * database can't be brute-forced offline (a 6-digit code has only 1M values).
 * Codes are never stored in plain text.
 */
export function hashOtp(code: string): string {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

/** Constant-time comparison of a candidate code against a stored hash. */
export function otpMatches(candidate: string, storedHash: string): boolean {
  if (typeof storedHash !== 'string') return false;
  const a = Buffer.from(hashOtp(candidate), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface ICustomerOTP extends Document {
  tenantId: mongoose.Types.ObjectId;
  phone: string;
  /** HMAC-SHA256 hex digest of the code (see hashOtp). */
  otpHash: string;
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
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    otpHash: {
      type: String,
      required: [true, 'OTP hash is required'],
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index defined via schema.index() below
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
      // Note: `$inc` bypasses schema validators, so the limit is enforced in
      // verify-otp via a conditional update ({ attempts: { $lt: MAX_OTP_ATTEMPTS } }).
      max: MAX_OTP_ATTEMPTS,
    },
  },
  {
    timestamps: true,
  }
);

// Serves every OTP query: send-otp rate-limit ({tenantId, phone, createdAt}) and
// invalidate ({tenantId, phone, verified}), verify-otp ({tenantId, phone, verified, ...}).
CustomerOTPSchema.index({ tenantId: 1, phone: 1, verified: 1 });

// Auto-delete expired OTPs
CustomerOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CustomerOTP: Model<ICustomerOTP> = 
  mongoose.models.CustomerOTP || mongoose.model<ICustomerOTP>('CustomerOTP', CustomerOTPSchema);

export default CustomerOTP;
