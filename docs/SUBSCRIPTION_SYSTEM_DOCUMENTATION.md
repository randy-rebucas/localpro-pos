# Subscription System Documentation

## Overview

The subscription system is a comprehensive tenant-exclusive billing and access control system that ensures all tenants have active subscriptions to use the Point of Sale (POS) application. The system provides automatic trial management, feature gating, usage tracking, and admin controls.

## Architecture

### Core Components

1. **Models**: `SubscriptionPlan.ts`, `Subscription.ts`
2. **API Routes**: Subscription management, plan retrieval, trial creation
3. **Client Components**: SubscriptionContext, SubscriptionStatusBar, SubscriptionGuard
4. **Admin Interface**: Subscription management dashboard
5. **User Interface**: Public upgrade page for expired trials

### Database Schema

#### SubscriptionPlan
```typescript
{
  name: string,           // Plan display name
  tier: string,           // unique identifier (starter, pro, business, enterprise)
  description?: string,
  price: {
    monthly: number,
    currency: string
  },
  features: {             // Feature limits and capabilities
    maxUsers: number,
    maxBranches: number,
    maxProducts: number,
    maxTransactions: number,
    enableInventory: boolean,
    enableCategories: boolean,
    enableDiscounts: boolean,
    enableLoyaltyProgram: boolean,
    enableCustomerManagement: boolean,
    enableBookingScheduling: boolean,
    enableReports: boolean,
    enableMultiBranch: boolean,
    enableHardwareIntegration: boolean,
    prioritySupport: boolean,
    customIntegrations: boolean,
    dedicatedAccountManager: boolean
  },
  isActive: boolean,
  isCustom: boolean      // For enterprise/custom plans
}
```

#### Subscription
```typescript
{
  tenantId: ObjectId,     // Reference to tenant
  planId: ObjectId,       // Reference to plan
  status: 'active' | 'inactive' | 'cancelled' | 'suspended' | 'trial',
  billingCycle: 'monthly' | 'yearly',
  startDate: Date,
  endDate?: Date,         // For cancelled/expired subscriptions
  trialEndDate?: Date,    // For trial subscriptions
  nextBillingDate?: Date,
  isTrial: boolean,
  autoRenew: boolean,
  usage: {                // Current usage tracking
    currentUsers: number,
    currentBranches: number,
    currentProducts: number,
    currentTransactions: number,
    lastResetDate: Date
  },
  billingHistory: Array    // Future billing records
}
```

## User Flow

### 1. New Tenant Registration

```
New Tenant → Automatic 14-Day Trial → Full System Access
```

- When a tenant first accesses admin features, the system automatically creates a 14-day trial subscription
- Trial uses the "Starter" plan features
- No manual intervention required

### 2. Trial Period

```
Trial Active → Show Days Remaining → Continue Normal Usage
```

- Subscription status bar displays trial countdown
- All features available according to plan limits
- Usage tracking active during trial

### 3. Trial Expiration

```
Trial Expires → Automatic Redirect → Upgrade Page
```

- Expired trials automatically redirect to `/subscription` upgrade page
- Clear messaging about trial expiration
- Contact form for sales inquiries

### 4. Paid Subscription

```
Contact Sales → Admin Creates Subscription → Full Access Restored
```

- Only admins can create paid subscriptions
- Manual subscription creation through admin dashboard
- Immediate access restoration upon subscription activation

## Feature Gating

### API-Level Protection

All resource creation APIs enforce subscription limits:

```typescript
// Example: User creation with limit checking
await checkSubscriptionLimit(tenantId, 'maxUsers', currentCount);
await SubscriptionService.updateUsage(tenantId, { users: count + 1 });
```

### Feature Access Control

APIs check feature flags before allowing operations:

```typescript
// Example: Discount creation requires feature access
await checkFeatureAccess(tenantId, 'enableDiscounts');
```

### Protected Features

- **Discounts**: Requires `enableDiscounts: true`
- **Bookings**: Requires `enableBookingScheduling: true`
- **Multi-branch**: Requires `enableMultiBranch: true`
- **Hardware Integration**: Requires `enableHardwareIntegration: true`

## Usage Tracking

### Automatic Tracking

The system automatically tracks usage across all resources:

- **Users**: Count of active users per tenant
- **Branches**: Number of active branches
- **Products**: Total active products
- **Transactions**: Monthly transaction count (resets monthly)

### Real-time Updates

Usage is updated immediately when resources are created/modified:

```typescript
// Update usage after successful creation
await SubscriptionService.updateUsage(tenantId, {
  users: currentCount + 1,
  transactions: monthlyCount + 1
});
```

## Admin Management

### Subscription Dashboard

Located at `/admin/subscriptions`, provides:

- **Current Subscriptions**: List all tenant subscriptions
- **Status Management**: Activate, suspend, cancel subscriptions
- **Usage Monitoring**: Real-time usage vs. limits
- **Plan Overview**: Available plans and features

### Subscription Creation

Admins can create subscriptions through the dashboard:

1. Select tenant
2. Choose subscription plan
3. Set billing cycle
4. Create trial or paid subscription

### Status Management

Admins can manage subscription status:

- **Activate**: Convert trial to paid
- **Suspend**: Temporarily disable access
- **Cancel**: End subscription
- **Reactivate**: Restore suspended subscriptions

## Public Interface

### Upgrade Page (`/subscription`)

For tenants with expired trials:

- **Plan Comparison**: Visual plan features and pricing
- **Contact Form**: Sales inquiry submission
- **Feature Highlights**: Clear benefit presentation

### Navigation Integration

Subscription status visible in drawer menu:

- **Status Indicator**: Active/Trial/Expired status
- **Plan Information**: Current plan name
- **Trial Countdown**: Days remaining (if applicable)
- **Management Link**: Quick access for admins

## Security & Access Control

### Tenant Isolation

- Each tenant's subscription data is completely isolated
- Usage tracking is tenant-specific
- Feature access based on individual tenant subscriptions

### Admin-Only Operations

- Subscription creation: Admin only
- Status management: Admin only
- Plan modifications: Admin only

### API Security

- All subscription APIs require proper authentication
- Role-based access control enforced
- Feature gating prevents unauthorized access

## Subscription Plans

### Included Plans

| Plan | Users | Branches | Products | Transactions | Price |
|------|-------|----------|----------|--------------|-------|
| **Starter** | 3 | 1 | 100 | 1,000 | ₱999/month |
| **Pro** | 10 | 2 | 1,000 | 10,000 | ₱1,999/month |
| **Business** | 25 | 5 | 5,000 | 50,000 | ₱3,999/month |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | Custom |

### Plan Features

- **Starter**: Basic POS functionality
- **Pro**: Advanced features, loyalty program
- **Business**: Multi-branch, customer management
- **Enterprise**: All features, custom integrations

## API Reference

### Core Endpoints

#### GET `/api/subscription-plans`
Returns all available subscription plans

#### GET `/api/subscriptions`
Returns tenant subscriptions (admin only)

#### POST `/api/subscriptions`
Creates new subscription (admin only)

#### PUT `/api/subscriptions/[id]`
Updates subscription status (admin only)

#### GET `/api/subscription/status`
Returns current tenant subscription status

#### POST `/api/subscriptions/create-trial`
Creates trial subscription for tenant

### Usage Tracking

All resource creation APIs automatically track usage:
- `POST /api/users`
- `POST /api/branches`
- `POST /api/products`
- `POST /api/transactions`

## Monitoring & Analytics

### Usage Dashboard

Admin dashboard provides real-time insights:

- Current usage vs. limits
- Subscription status overview
- Trial expiration alerts
- Revenue tracking (future)

### Alerts & Notifications

- Trial expiration warnings
- Usage limit approaching alerts
- Subscription status changes

## Deployment & Setup

### Database Setup

```bash
# Run subscription plan seeding
npm run subscription:plans
```

### Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/pos-system
JWT_SECRET=your-jwt-secret
# ... other required variables
```

### Feature Flags

Configure tenant settings to enable/disable features:

```javascript
{
  enableDiscounts: true,
  enableBookingScheduling: false,
  enableMultiBranch: true
  // ... other feature flags
}
```

## Troubleshooting

### Common Issues

1. **Trial Not Created**: Check database connectivity
2. **Feature Access Denied**: Verify subscription plan includes feature
3. **Usage Not Tracking**: Check API logs for update failures
4. **Status Not Updating**: Verify admin permissions

### Debug Commands

```bash
# Check subscription status
curl http://localhost:3000/api/subscription/status

# View available plans
curl http://localhost:3000/api/subscription-plans

# Check tenant subscriptions (admin)
curl http://localhost:3000/api/subscriptions
```

## Future Enhancements

### Planned Features

- **Automated Billing**: Stripe/PayPal integration
- **Usage Analytics**: Detailed reporting dashboard
- **Subscription Analytics**: Revenue and churn metrics
- **Multi-currency Support**: International pricing
- **Subscription Transfers**: Account migration
- **Bulk Operations**: Mass subscription management

### Integration Points

- **Payment Processing**: External payment gateways
- **Email Notifications**: Subscription alerts
- **SMS Integration**: Trial reminders
- **Webhook Support**: External system integration

---

This subscription system provides a robust, scalable foundation for tenant billing and access control, ensuring fair resource usage while maintaining a smooth user experience for both tenants and administrators.