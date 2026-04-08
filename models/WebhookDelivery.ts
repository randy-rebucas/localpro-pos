import mongoose, { Schema, Document, Model } from 'mongoose';
import { WEBHOOK_EVENTS } from './Webhook';

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

export interface IWebhookDelivery extends Document {
  webhookId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  event: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  responseCode?: number;
  responseBody?: string;
  attempts: number;
  nextRetryAt?: Date;
  deliveredAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema: Schema = new Schema(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    event: { type: String, required: true, enum: WEBHOOK_EVENTS },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'retrying'],
      default: 'pending',
    },
    responseCode: { type: Number },
    responseBody: { type: String, maxlength: 2000 },
    attempts: { type: Number, default: 0 },
    nextRetryAt: { type: Date, index: true },
    deliveredAt: { type: Date },
    error: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

// Auto-delete delivery records older than 30 days
WebhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const WebhookDelivery: Model<IWebhookDelivery> =
  mongoose.models.WebhookDelivery ||
  mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);

export default WebhookDelivery;
