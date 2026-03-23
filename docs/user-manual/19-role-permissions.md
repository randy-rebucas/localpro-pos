# 19. Role Permission Reference

## Role Hierarchy

```
Owner (Level 5)
  └── Admin (Level 4)
       └── Manager (Level 3)
            └── Cashier (Level 2)
                 └── Viewer (Level 1)
```

Each role inherits all permissions from the levels below it.

## Complete Permission Matrix

### Core Modules

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| View Dashboard | Yes | Yes | Yes | Yes | Yes |
| View Products | Yes | Yes | Yes | Yes | Yes |
| View Transactions | Yes | Yes | Yes | Yes | Yes |
| Process Sales (POS) | - | Yes | Yes | Yes | Yes |
| Process Refunds | - | Yes | Yes | Yes | Yes |
| Void Transactions | - | - | Yes | Yes | Yes |
| Manage Cash Drawer | - | Yes | Yes | Yes | Yes |
| Clock In/Out | Yes | Yes | Yes | Yes | Yes |

### Product & Inventory

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| View Products | Yes | Yes | Yes | Yes | Yes |
| Create Products | - | - | Yes | Yes | Yes |
| Edit Products | - | - | Yes | Yes | Yes |
| Deactivate Products | - | - | Yes | Yes | Yes |
| Manage Categories | - | - | Yes | Yes | Yes |
| Manage Bundles | - | - | Yes | Yes | Yes |
| View Inventory | - | - | Yes | Yes | Yes |
| Adjust Stock | - | - | Yes | Yes | Yes |
| Transfer Stock | - | - | Yes | Yes | Yes |
| View Stock Movements | - | - | Yes | Yes | Yes |

### Discounts & Pricing

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| Apply Discount Codes | - | Yes | Yes | Yes | Yes |
| Apply Manual Discounts | - | - | Yes | Yes | Yes |
| Apply SC/PWD Discounts | - | Yes | Yes | Yes | Yes |
| Create Discount Codes | - | - | Yes | Yes | Yes |
| Manage Discounts | - | - | Yes | Yes | Yes |

### Customers & Bookings

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| View Customers | - | - | Yes | Yes | Yes |
| Create Customers | - | - | Yes | Yes | Yes |
| Edit Customers | - | - | Yes | Yes | Yes |
| View Bookings | - | - | Yes | Yes | Yes |
| Create Bookings | - | - | Yes | Yes | Yes |
| Edit Bookings | - | - | Yes | Yes | Yes |
| Cancel Bookings | - | - | Yes | Yes | Yes |

### Reports & Analytics

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| View Reports | - | - | Yes | Yes | Yes |
| Export Reports | - | - | Yes | Yes | Yes |
| View Sales Journal | - | - | Yes | Yes | Yes |
| View VAT Report | - | - | Yes | Yes | Yes |
| View P&L Report | - | - | Yes | Yes | Yes |
| View Cash Drawer Report | - | - | Yes | Yes | Yes |

### Staff & Attendance

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| Clock In/Out (self) | Yes | Yes | Yes | Yes | Yes |
| View Own Attendance | Yes | Yes | Yes | Yes | Yes |
| View All Attendance | - | - | Yes | Yes | Yes |
| Manage Attendance | - | - | Yes | Yes | Yes |
| View Expenses | - | - | Yes | Yes | Yes |
| Create Expenses | - | - | Yes | Yes | Yes |

### Administration

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| View Audit Logs | - | - | - | Yes | Yes |
| Manage Users | - | - | - | Yes | Yes |
| Create Admin Users | - | - | - | - | Yes |
| Manage Settings | - | - | - | Yes | Yes |
| Manage Tax Rules | - | - | - | Yes | Yes |
| Manage Branches | - | - | - | Yes | Yes |
| Manage Business Hours | - | - | - | Yes | Yes |
| Manage Holidays | - | - | - | Yes | Yes |
| Manage Hardware | - | - | - | Yes | Yes |
| Manage Multi-Currency | - | - | - | Yes | Yes |
| Manage Notification Templates | - | - | - | Yes | Yes |
| Manage Feature Flags | - | - | - | Yes | Yes |
| Manage Branding | - | - | - | Yes | Yes |
| Backup & Restore | - | - | - | Yes | Yes |
| Manage Automations | - | - | - | Yes | Yes |

### Owner-Only

| Permission | Viewer | Cashier | Manager | Admin | Owner |
|-----------|--------|---------|---------|-------|-------|
| Manage Tenants | - | - | - | - | Yes |
| Manage Subscriptions | - | - | - | - | Yes |
| View Billing | - | - | - | - | Yes |
| Create Owner Users | - | - | - | - | Yes |
| Delete Tenant | - | - | - | - | Yes |

## Quick Reference by Role

### Viewer
- Dashboard, product catalog, transaction history (read-only)
- Clock in/out for attendance
- No POS access, no editing capabilities

### Cashier
- Everything Viewer can do, plus:
- Process sales and refunds via POS
- Apply discount codes and SC/PWD discounts
- Manage cash drawer (open, close, cash in/out)

### Manager
- Everything Cashier can do, plus:
- Full product, category, and bundle management
- Inventory management and stock adjustments
- Customer management
- Booking and scheduling
- Expense tracking
- All reports and analytics
- Staff attendance oversight
- Manual discounts and discount code management

### Admin
- Everything Manager can do, plus:
- User management (create/edit/deactivate users up to Manager role)
- System settings and configuration
- Tax rules and business hours
- Hardware and notification configuration
- Audit log access
- Branch management
- Data backup and restore
- Feature flags and branding

### Owner
- Everything Admin can do, plus:
- Tenant management
- Subscription and billing management
- Create Admin and Owner users
- Full system control
