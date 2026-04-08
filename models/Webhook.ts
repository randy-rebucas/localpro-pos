import mongoose, { Schema, Document, Model } from 'mongoose';

export const WEBHOOK_EVENTS = [
  'transaction.created',
  'transaction.refunded',
  'customer.created',
  'customer.updated',
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'inventory.low_stock',
  'inventory.updated',
  'order.created',
  'order.completed',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export interface IWebhook extends Document {
  name: string;
  url: string;
  events: WebhookEvent[];
  secret: string; // HMAC secret for signature
  isActive: boolean;
  tenantId: mongoose.Types.ObjectId;
  lastDeliveryAt?: Date;
  failureCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, trim: true },
    events: {
      type: [String],
      enum: WEBHOOK_EVENTS,
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one event is required',
      },
    },
    secret: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    lastDeliveryAt: { type: Date },
    failureCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

WebhookSchema.index({ tenantId: 1, isActive: 1 });

const Webhook: Model<IWebhook> =
  mongoose.models.Webhook || mongoose.model<IWebhook>('Webhook', WebhookSchema);

export default Webhook;
