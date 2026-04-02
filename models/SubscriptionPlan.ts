import mongoose, { Schema, Document, Model } from 'mongoose';

export type SubscriptionTier = 'starter' | 'pro' | 'business' | 'enterprise';

export interface ISubscriptionPlan extends Document {
  name: string;
  tier: SubscriptionTier;
  description?: string;
  price: {
    monthly: number;
    setupFee: number; // One-time setup fee
    currency: string;
  };
  features: {
    maxUsers: number;
    maxBranches: number;
    maxProducts: number;
    maxTransactions: number;
    enableInventory: boolean;
    enableCategories: boolean;
    enableDiscounts: boolean;
    enableLoyaltyProgram: boolean;
    enableCustomerManagement: boolean;
    enableBookingScheduling: boolean;
    enableTableManagement: boolean;
    enableReports: boolean;
    enableMultiBranch: boolean;
    enableHardwareIntegration: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    dedicatedAccountManager: boolean;
  };
  birCompliance: {
    ptuAssistance: boolean; // Permit to Use assistance
    receiptFormatting: boolean; // BIR-compliant receipt formatting
    birDocumentation: boolean; // BIR documentation package
    casReporting: boolean; // Computerized Accounting System reporting
    auditTrailSystem: boolean; // Full audit trail
    monthlySupport: boolean; // Monthly compliance support
  };
  isActive: boolean;
  isCustom: boolean; // For enterprise/custom pricing
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
    },
    tier: {
      type: String,
      enum: ['starter', 'pro', 'business', 'enterprise'],
      required: [true, 'Plan tier is required'],
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      monthly: {
        type: Number,
        required: [true, 'Monthly price is required'],
        min: [0, 'Price cannot be negative'],
      },
      setupFee: {
        type: Number,
        default: 0,
        min: [0, 'Setup fee cannot be negative'],
      },
      currency: {
        type: String,
        default: 'PHP',
      },
    },
    features: {
      maxUsers: {
        type: Number,
        required: true,
        min: [-1, 'Must be -1 (unlimited) or greater than 0'],
        validate: {
          validator: function(value: number) {
            return value === -1 || value >= 1;
          },
          message: 'Must be -1 (unlimited) or at least 1 user'
        }
      },
      maxBranches: {
        type: Number,
        required: true,
        min: [-1, 'Must be -1 (unlimited) or greater than 0'],
        validate: {
          validator: function(value: number) {
            return value === -1 || value >= 1;
          },
          message: 'Must be -1 (unlimited) or at least 1 branch'
        }
      },
      maxProducts: {
        type: Number,
        required: true,
        min: [-1, 'Must be -1 (unlimited) or non-negative'],
        validate: {
          validator: function(value: number) {
            return value === -1 || value >= 0;
          },
          message: 'Must be -1 (unlimited) or non-negative'
        }
      },
      maxTransactions: {
        type: Number,
        required: true,
        min: [-1, 'Must be -1 (unlimited) or non-negative'],
        validate: {
          validator: function(value: number) {
            return value === -1 || value >= 0;
          },
          message: 'Must be -1 (unlimited) or non-negative'
        }
      },
      enableInventory: {
        type: Boolean,
        default: true,
      },
      enableCategories: {
        type: Boolean,
        default: true,
      },
      enableDiscounts: {
        type: Boolean,
        default: false,
      },
      enableLoyaltyProgram: {
        type: Boolean,
        default: false,
      },
      enableCustomerManagement: {
        type: Boolean,
        default: false,
      },
      enableBookingScheduling: {
        type: Boolean,
        default: false,
      },
      enableTableManagement: {
        type: Boolean,
        default: false,
      },
      enableReports: {
        type: Boolean,
        default: true,
      },
      enableMultiBranch: {
        type: Boolean,
        default: false,
      },
      enableHardwareIntegration: {
        type: Boolean,
        default: false,
      },
      prioritySupport: {
        type: Boolean,
        default: false,
      },
      customIntegrations: {
        type: Boolean,
        default: false,
      },
      dedicatedAccountManager: {
        type: Boolean,
        default: false,
      },
    },
    birCompliance: {
      ptuAssistance: {
        type: Boolean,
        default: false,
      },
      receiptFormatting: {
        type: Boolean,
        default: false,
      },
      birDocumentation: {
        type: Boolean,
        default: false,
      },
      casReporting: {
        type: Boolean,
        default: false,
      },
      auditTrailSystem: {
        type: Boolean,
        default: false,
      },
      monthlySupport: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Cascade delete protection: prevent deletion if active subscriptions reference this plan
async function checkSubscriptionPlanDependencies(filter: Record<string, unknown>) {
  const doc = await mongoose.model('SubscriptionPlan').findOne(filter);
  if (!doc) return;

  const Subscription = mongoose.model('Subscription');
  const activeSubCount = await Subscription.countDocuments({
    planId: doc._id,
    status: { $in: ['active', 'trial'] },
  });
  if (activeSubCount > 0) {
    throw new Error(
      `Cannot delete subscription plan "${doc.name}": ${activeSubCount} active subscription(s) reference this plan. Migrate subscribers to another plan first.`
    );
  }
}

SubscriptionPlanSchema.pre('findOneAndDelete', async function (next) {
  try {
    await checkSubscriptionPlanDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

SubscriptionPlanSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  try {
    await checkSubscriptionPlanDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Create indexes
SubscriptionPlanSchema.index({ isActive: 1 });

const SubscriptionPlan: Model<ISubscriptionPlan> = mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>('SubscriptionPlan', SubscriptionPlanSchema);

export default SubscriptionPlan;