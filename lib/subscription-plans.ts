export const SUBSCRIPTION_PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    price: 0,
    currency: 'USD',
    features: ['POS', 'Inventory', 'Reporting'],
    description: 'Basic plan with essential POS features.',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 49,
    currency: 'USD',
    features: ['All Basic features', 'Multi-branch', 'Advanced Analytics'],
    description: 'Pro plan for growing businesses.',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 199,
    currency: 'USD',
    features: [
      'All Pro features',
      'Custom Integrations',
      'Priority Support',
      'White-labeling',
    ],
    description: 'Enterprise plan with full customization and support.',
  },
];