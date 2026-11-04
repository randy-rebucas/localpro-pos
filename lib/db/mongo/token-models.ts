/**
 * Token-revocation collections, moved here from lib/token-blacklist.ts so
 * that module only holds the caching logic. Collection names are unchanged.
 */
import mongoose, { Schema, Model } from 'mongoose';

interface IRevokedToken {
  tokenHash: string;
  reason: string;
  expiresAt: Date;
}

const RevokedTokenSchema = new Schema<IRevokedToken>({
  tokenHash: {
    type: String,
    required: true,
    unique: true, // unique implies index
  },
  reason: {
    type: String,
    default: 'logout',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// MongoDB removes revoked tokens once they would have expired anyway
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

interface IUserRevocation {
  userId: string;
  revokedBefore: Date;
}

const UserRevocationSchema = new Schema<IUserRevocation>({
  userId: {
    type: String,
    required: true,
    unique: true, // unique implies index
  },
  revokedBefore: {
    type: Date,
    required: true,
  },
});

export const RevokedTokenModel: Model<IRevokedToken> =
  mongoose.models.RevokedToken || mongoose.model<IRevokedToken>('RevokedToken', RevokedTokenSchema);

export const UserRevocationModel: Model<IUserRevocation> =
  mongoose.models.UserRevocation || mongoose.model<IUserRevocation>('UserRevocation', UserRevocationSchema);
