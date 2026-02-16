import mongoose, { Schema, Document, Model } from 'mongoose';

export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'suspended' | 'trial';
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
  suspendedAt?: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: [true, 'Plan ID is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'suspended', 'trial'],
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
    suspendedAt: {
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
  },
  {
    timestamps: true,
  }
);

// Create indexes
SubscriptionSchema.index({ tenantId: 1 }, { unique: true }); // One subscription per tenant
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ nextBillingDate: 1 });
SubscriptionSchema.index({ endDate: 1 });
SubscriptionSchema.index({ trialEndDate: 1 });

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

const Subscription: Model<ISubscription> = mongoose.models.Subscription ||
  mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

export default Subscription;