# 11. Automations

## Overview

1POS includes 30+ background automations that run on schedules to handle repetitive tasks. Automations run via cron jobs and can be configured per tenant.

## Automation Categories

### Sales & Transactions

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Transaction Receipts** | Auto-email receipts to customers after sale | Real-time |
| **Abandoned Carts** | Detect and notify about abandoned saved carts | Every 6 hours |
| **Dynamic Pricing** | Adjust prices based on demand/time rules | Every hour |

### Inventory

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Low Stock Alerts** | Email when stock drops below threshold | Every 6 hours |
| **Predictive Stock** | Forecast when stock will run out | Daily |
| **Stock Transfer** | Auto-suggest transfers between branches | Daily |
| **Purchase Orders** | Auto-generate PO recommendations | Weekly |
| **Product Performance** | Track product sales metrics | Daily |

### Bookings

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Booking Confirmations** | Send confirmation email/SMS | Real-time |
| **Booking Reminders** | Send 24h reminder | Every hour |
| **Booking No-Show** | Mark overdue bookings as no-show | Every 30 min |

### Staff & Attendance

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Auto Clock-Out** | Clock out staff who forget | Every 30 min |
| **Attendance Violations** | Alert on repeated tardiness | Daily |
| **Break Detection** | Monitor excessive break durations | Every hour |
| **Cash Count Reminders** | Remind cashiers to count cash | Configurable |

### Customers

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Customer Welcome** | Send welcome email to new customers | Real-time |
| **Customer Lifetime Value** | Calculate CLV scores | Weekly |

### Finance & Cash

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Cash Drawer Closure** | Auto-close drawers at end of day | Daily at close |
| **Sales Trend Analysis** | Analyze sales patterns | Weekly |

### Discounts

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Discount Management** | Expire/activate time-based discounts | Every hour |

### Reports

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Report Delivery** | Email scheduled reports | Daily/Weekly/Monthly |

### Security

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Session Expiration** | Clean up expired sessions | Every hour |
| **Suspicious Activity** | Detect unusual patterns (high refunds, etc.) | Every 30 min |

### Data Management

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Database Backups** | Create automated backups | Daily |
| **Data Archiving** | Archive old records for retention | Monthly |
| **Audit Log Cleanup** | Trim very old audit entries | Monthly |

### Sync

| Automation | Description | Default Schedule |
|-----------|-------------|-----------------|
| **Offline Sync** | Process offline-queued transactions | Every 5 min |
| **Multi-Branch Sync** | Sync shared data across branches | Every 15 min |

## Configuring Automations

### Via Admin UI

1. Navigate to the relevant admin module (e.g., **Admin > Attendance** for attendance automations)
2. Look for the **Automation** or **Settings** section
3. Toggle automations on/off
4. Configure parameters (thresholds, schedules, recipients)
5. Click **Save**

### Key Configuration Parameters

**Low Stock Alerts:**
- Threshold: Set per product or use global default (tenant setting)
- Recipients: Manager and Admin roles
- Frequency: How often to check

**Auto Clock-Out:**
- Max hours: `attendanceNotifications.maxHoursWithoutClockOut` (default: 12)
- Notification: Send to staff member and their manager

**Booking Reminders:**
- Lead time: How far before appointment (default: 24 hours)
- Channel: Email, SMS, or both

**Report Delivery:**
- Reports: Select which reports to send
- Recipients: Email addresses
- Frequency: Daily, Weekly, Monthly
- Format: PDF or Excel attachment

**Database Backups:**
- Schedule: Daily (configurable time)
- Storage: Local + S3 (if configured)
- Retention: How many backups to keep

## Automation API Endpoints

Each automation has a corresponding API endpoint:

```
POST /api/automations/{automation-name}/run     — Trigger manually
GET  /api/automations/{automation-name}/status   — Check status
PUT  /api/automations/{automation-name}/config   — Update config
```

### Manual Trigger

To run an automation immediately:
```
POST /api/automations/low-stock-alerts/run
Authorization: Bearer {token}
```

## Monitoring Automations

### Automation Logs

All automation runs are logged:
- Timestamp
- Duration
- Status (success/failure)
- Records processed
- Errors (if any)

View logs in the server output or via the admin panel.

### Common Issues

| Issue | Cause | Solution |
|-------|-------|---------|
| Automation not running | Cron not configured | Verify cron job setup |
| Emails not sending | Provider not configured | Check notification settings |
| Wrong data in reports | Timezone mismatch | Verify tenant timezone |
| Backup failures | S3 credentials invalid | Check AWS configuration |
| High frequency alerts | Threshold too high | Adjust low stock threshold |

## Automation Dependencies

Some automations require specific configuration:

| Automation | Requires |
|-----------|---------|
| Email notifications | Email provider configured |
| SMS notifications | SMS provider configured |
| Database backups | S3 credentials (for cloud backup) |
| Multi-branch sync | Multiple active branches |
| Booking reminders | Bookings feature enabled |
| Discount management | Discounts feature enabled |
| Customer welcome | Customer management enabled |
