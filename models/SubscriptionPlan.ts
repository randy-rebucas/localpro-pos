import mongoose, { Schema, Document, Model } from 'mongoose';

export type SubscriptionTier = 'starter' | 'pro' | 'business' | 'enterprise';

export interface ISubscriptionPlan extends Document {
  name: string;
  tier: SubscriptionTier;
  description?: string;
  price: {
    monthly: number;
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
    enableReports: boolean;
    enableMultiBranch: boolean;
    enableHardwareIntegration: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    dedicatedAccountManager: boolean;
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

// Create indexes
SubscriptionPlanSchema.index({ isActive: 1 });

const SubscriptionPlan: Model<ISubscriptionPlan> = mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>('SubscriptionPlan', SubscriptionPlanSchema);

export default SubscriptionPlan;