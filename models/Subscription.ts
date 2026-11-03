import mongoose, { Schema, Document, Model, Query } from 'mongoose';
import { invalidateSubscriptionCache } from '@/lib/cache';

export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'suspended' | 'trial' | 'paused';
export type BillingCycle = 'monthly' | 'yearly';

export interface ISubscription extends Document {
  tenantId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startDate: Date;
  endDate?: Date;
  trialEndDate?: Date;
  nextBillingDate?: Date;
  lastBillingDate?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  suspendedAt?: Date;
  pausedAt?: Date;
  pauseReason?: string;
  pauseEndsAt?: Date;
  gracePeriodEndDate?: Date;
  trialConvertedAt?: Date;
  paymentOverdue: boolean;
  outstandingBalance: number;
  lastInvoiceGeneratedAt?: Date;
  lateFeeAppliedAt?: Date;
  reactivationFeeAppliedAt?: Date;
  deactivatedAt?: Date;
  paymentMethod?: {
    type: 'card' | 'bank' | 'paypal' | 'manual';
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
    provider?: string;
  };
  billingHistory: Array<{
    date: Date;
    amount: number;
    currency: string;
    status: 'paid' | 'failed' | 'pending' | 'refunded';
    transactionId?: string;
    invoiceUrl?: string;
  }>;
  usage: {
    currentUsers: number;
    currentBranches: number;
    currentProducts: number;
    currentTransactions: number;
    lastResetDate: Date;
  };
  isTrial: boolean;
  autoRenew: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: [true, 'Plan ID is required'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused'],
      default: 'trial',
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
      required: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    endDate: {
      type: Date,
    },
    trialEndDate: {
      type: Date,
    },
    nextBillingDate: {
      type: Date,
    },
    lastBillingDate: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    suspendedAt: {
      type: Date,
    },
    pausedAt: {
      type: Date,
    },
    pauseReason: {
      type: String,
      trim: true,
    },
    pauseEndsAt: {
      type: Date,
    },
    gracePeriodEndDate: {
      type: Date,
    },
    trialConvertedAt: {
      type: Date,
    },
    paymentOverdue: {
      type: Boolean,
      default: false,
    },
    outstandingBalance: {
      type: Number,
      default: 0,
      min: [0, 'Outstanding balance cannot be negative'],
    },
    lastInvoiceGeneratedAt: {
      type: Date,
    },
    lateFeeAppliedAt: {
      type: Date,
    },
    reactivationFeeAppliedAt: {
      type: Date,
    },
    deactivatedAt: {
      type: Date,
    },
    paymentMethod: {
      type: {
        type: String,
        enum: ['card', 'bank', 'paypal', 'manual'],
      },
      last4: String,
      expiryMonth: {
        type: Number,
        min: 1,
        max: 12,
      },
      expiryYear: {
        type: Number,
        min: 2024,
        max: 2050,
      },
      provider: String,
    },
    billingHistory: [{
      date: {
        type: Date,
        required: true,
      },
      amount: {
        type: Number,
        required: true,
        min: [0, 'Amount cannot be negative'],
      },
      currency: {
        type: String,
        required: true,
        default: 'PHP',
      },
      status: {
        type: String,
        enum: ['paid', 'failed', 'pending', 'refunded'],
        required: true,
      },
      transactionId: String,
      invoiceUrl: String,
    }],
    usage: {
      currentUsers: {
        type: Number,
        default: 0,
        min: [0, 'Cannot be negative'],
      },
      currentBranches: {
        type: Number,
        default: 1,
        min: [1, 'Must have at least 1 branch'],
      },
      currentProducts: {
        type: Number,
        default: 0,
        min: [0, 'Cannot be negative'],
      },
      currentTransactions: {
        type: Number,
        default: 0,
        min: [0, 'Cannot be negative'],
      },
      lastResetDate: {
        type: Date,
        default: Date.now,
      },
    },
    isTrial: {
      type: Boolean,
      default: true,
    },
    autoRenew: {
      type: Boolean,
      default: true,
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

// Create indexes
SubscriptionSchema.index({ tenantId: 1 }, { unique: true }); // One subscription per tenant
SubscriptionSchema.index({ status: 1 }); // super-admin cross-tenant analytics (active/trial MRR)
// Compound index for plan usage reporting
SubscriptionSchema.index({ planId: 1, status: 1 });
// Cross-tenant billing/expiry automation (finding subscriptions due for billing).
// A tenantId prefix is pointless here: { tenantId } is unique, so it already
// pins a single document.
SubscriptionSchema.index({ status: 1, nextBillingDate: 1 });

// Virtual for checking if subscription is expired
SubscriptionSchema.virtual('isExpired').get(function() {
  if (!this.endDate) return false;
  return new Date() > this.endDate;
});

// Virtual for checking if trial is expired
SubscriptionSchema.virtual('isTrialExpired').get(function() {
  if (!this.isTrial || !this.trialEndDate) return false;
  return new Date() > this.trialEndDate;
});

// Method to check if subscription allows a feature
// eslint-disable-next-line @typescript-eslint/no-unused-vars
SubscriptionSchema.methods.canUseFeature = function(featureName: string): boolean {
  // This will be populated with the plan data when needed
  // For now, return true for basic features during trial
  if (this.status === 'trial' && !this.isTrialExpired) {
    return true;
  }

  // For active subscriptions, check against plan limits
  if (this.status !== 'active') {
    return false;
  }

  // Feature checks will be implemented when we populate the plan
  return true;
};

// Method to check if subscription exceeds limits
// eslint-disable-next-line @typescript-eslint/no-unused-vars
SubscriptionSchema.methods.checkLimits = function(usage: {
  users?: number;
  branches?: number;
  products?: number;
  transactions?: number;
}): { exceeded: boolean; limits: string[] } {
  // const limits: string[] = [];

  // During trial, no limits
  if (this.status === 'trial' && !this.isTrialExpired) {
    return { exceeded: false, limits: [] };
  }

  // Check limits based on plan (will be populated)
  // For now, return no limits exceeded for active subscriptions
  if (this.status === 'active') {
    return { exceeded: false, limits: [] };
  }

  return { exceeded: true, limits: ['subscription_inactive'] };
};

// SubscriptionService.getSubscriptionStatus is cached (lib/cache.ts) — drop it on
// writes. Usage-counter updates (one per sale) are skipped: a usage figure up to
// 60s stale is fine for limit checks, and flushing on every sale would defeat the cache.
function touchesOnlyUsage(update: unknown): boolean {
  if (!update || typeof update !== 'object') return false;
  const keys: string[] = [];
  for (const [k, v] of Object.entries(update as Record<string, unknown>)) {
    if (k.startsWith('$') && v && typeof v === 'object') keys.push(...Object.keys(v));
    else keys.push(k);
  }
  // timestamps: true adds $set.updatedAt to every update — not a real change
  const real = keys.filter((k) => k !== 'updatedAt' && k !== 'createdAt');
  return real.length > 0 && real.every((k) => k.startsWith('usage.'));
}

SubscriptionSchema.post('save', (doc: ISubscription) => invalidateSubscriptionCache(String(doc.tenantId)));
SubscriptionSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany'],
  function (this: Query<unknown, ISubscription>) {
    if (touchesOnlyUsage(this.getUpdate?.())) return;
    invalidateSubscriptionCache();
  }
);

const Subscription: Model<ISubscription> = mongoose.models.Subscription ||
  mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

export default Subscription;