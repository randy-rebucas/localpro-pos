import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * Ephemeral POS <-> customer-display session (app/api/pos/session/[sessionId]).
 *
 * `tenantId` is the authenticated caller's tenant (set server-side from the JWT); the
 * route looks sessions up by the unique `sessionId` and rejects any whose `tenantId`
 * differs from the caller's. `tenant` (slug) is kept for backward compatibility.
 * Sessions are removed by the TTL index on `updatedAt` one hour after the last write
 * (Mongoose timestamps bump updatedAt on create, save, findOneAndUpdate and upserts).
 *
 * `lastUpdate` (epoch ms) is kept only because the GET response returns it; it is a
 * Number, so it cannot drive a TTL index.
 */
export interface IPosSession {
  sessionId: string;
  tenant: string;
  tenantId?: Types.ObjectId;
  cart: unknown[];
  subtotal: number;
  discount: unknown;
  taxAmount?: number;
  taxRate?: number;
  taxLabel?: string;
  tip: number;
  total: number;
  paymentMethod: string | null;
  paymentStatus: 'pending' | 'processing' | 'completed' | 'failed';
  lastUpdate: number;
  createdAt: Date;
  updatedAt: Date;
}

export const POS_SESSION_TTL_SECONDS = 60 * 60;

const PosSessionSchema = new Schema<IPosSession>(
  {
    sessionId: { type: String, required: true, unique: true },
    tenant: { type: String, required: true },
    // Optional only so sessions written before this field existed (≤1h TTL) still load.
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    cart: { type: Array, default: [] },
    subtotal: { type: Number, default: 0 },
    discount: { type: Schema.Types.Mixed, default: null },
    taxAmount: { type: Number },
    taxRate: { type: Number },
    taxLabel: { type: String },
    tip: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paymentMethod: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    lastUpdate: { type: Number, default: Date.now },
  },
  { timestamps: true }
);

// TTL: expire a session one hour after its last update.
PosSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: POS_SESSION_TTL_SECONDS });

const PosSession: Model<IPosSession> =
  (mongoose.models.PosSession as Model<IPosSession>) ||
  mongoose.model<IPosSession>('PosSession', PosSessionSchema);

export default PosSession;
