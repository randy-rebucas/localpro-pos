import mongoose, { Schema, Document, Model } from 'mongoose';

export type BillingEventType =
  | 'invoice_created'
  | 'payment_received'
  | 'payment_failed'
  | 'refund_issued'
  | 'credit_applied'
  | 'plan_changed'
  | 'trial_started'
  | 'trial_converted'
  | 'subscription_cancelled'
  | 'subscription_suspended'
  | 'subscription_paused'
  | 'subscription_resumed'
  | 'manual_adjustment'
  | 'invoice_generated'
  | 'payment_overdue'
  | 'late_fee_applied'
  | 'reactivation_fee_applied'
  | 'account_deactivated'
  | 'account_reactivated';

export interface IBillingEvent extends Document {
  tenantId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  type: BillingEventType;
  amount: number;
  currency: string;
  description?: string;
  notes?: string;
  transactionId?: string;
  invoiceUrl?: string;
  recordedBy?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const BillingEventSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'invoice_created',
        'payment_received',
        'payment_failed',
        'refund_issued',
        'credit_applied',
        'plan_changed',
        'trial_started',
        'trial_converted',
        'subscription_cancelled',
        'subscription_suspended',
        'subscription_paused',
        'subscription_resumed',
        'manual_adjustment',
        'invoice_generated',
        'payment_overdue',
        'late_fee_applied',
        'reactivation_fee_applied',
        'account_deactivated',
        'account_reactivated',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'PHP',
    },
    description: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    invoiceUrl: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

BillingEventSchema.index({ tenantId: 1, createdAt: -1 });

const BillingEvent: Model<IBillingEvent> =
  mongoose.models.BillingEvent ||
  mongoose.model<IBillingEvent>('BillingEvent', BillingEventSchema);

export default BillingEvent;
