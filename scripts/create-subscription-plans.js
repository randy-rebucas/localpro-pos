const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');

const subscriptionPlans = [
  {
    name: 'Starter',
    tier: 'starter',
    description: 'Perfect for micro businesses getting started with POS',
    price: {
      monthly: 999,
      currency: 'PHP',
    },
    features: {
      maxUsers: 3,
      maxBranches: 1,
      maxProducts: 100,
      maxTransactions: 1000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: false,
      enableLoyaltyProgram: false,
      enableCustomerManagement: false,
      enableBookingScheduling: false,
      enableReports: true,
      enableMultiBranch: false,
      enableHardwareIntegration: false,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    isActive: true,
    isCustom: false,
  },
  {
    name: 'Pro',
    tier: 'pro',
    description: 'Ideal for core MSMEs scaling their operations',
    price: {
      monthly: 1999,
      currency: 'PHP',
    },
    features: {
      maxUsers: 10,
      maxBranches: 2,
      maxProducts: 1000,
      maxTransactions: 10000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: false,
      enableBookingScheduling: false,
      enableReports: true,
      enableMultiBranch: false,
      enableHardwareIntegration: true,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    isActive: true,
    isCustom: false,
  },
  {
    name: 'Business',
    tier: 'business',
    description: 'Designed for multi-branch businesses',
    price: {
      monthly: 3999,
      currency: 'PHP',
    },
    features: {
      maxUsers: 25,
      maxBranches: 5,
      maxProducts: 5000,
      maxTransactions: 50000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: true,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: true,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    isActive: true,
    isCustom: false,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    description: 'Custom solutions for chains and LGUs',
    price: {
      monthly: 0, // Custom pricing
      currency: 'PHP',
    },
    features: {
      maxUsers: -1, // Unlimited
      maxBranches: -1, // Unlimited
      maxProducts: -1, // Unlimited
      maxTransactions: -1, // Unlimited
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: true,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: true,
      customIntegrations: true,
      dedicatedAccountManager: true,
    },
    isActive: true,
    isCustom: true,
  },
];

async function createSubscriptionPlans() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';

    if (!MONGODB_URI) {
      throw new Error('Please define the MONGODB_URI environment variable');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    // Clear existing plans
    await SubscriptionPlan.deleteMany({});
    console.log('Cleared existing subscription plans');

    // Create new plans
    const createdPlans = await SubscriptionPlan.insertMany(subscriptionPlans);
    console.log(`Created ${createdPlans.length} subscription plans:`);

    createdPlans.forEach(plan => {
      console.log(`- ${plan.name} (${plan.tier}): ₱${plan.price.monthly}/month`);
    });

    console.log('Subscription plans created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating subscription plans:', error.message);
    process.exit(1);
  }
}

createSubscriptionPlans();