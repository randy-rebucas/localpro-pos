# 12. Settings & Configuration

**Available to:** Admin, Owner

## Accessing Settings

Navigate to **Settings** from the sidebar. Settings are organized into sections.

## General Settings

| Setting | Description |
|---------|-------------|
| **Store Name** | Your business display name |
| **Business Type** | Industry type (Retail, Restaurant, Salon, etc.) |
| **Address** | Physical store address |
| **Phone** | Store contact number |
| **Email** | Store contact email |
| **TIN** | Tax Identification Number (for BIR receipts) |
| **Currency** | Primary currency (PHP, USD, etc.) |
| **Timezone** | Local timezone |
| **Language** | Default language |

## Business Hours

1. Navigate to **Settings > Business Hours** or **Admin > Business Hours**
2. Set operating hours for each day of the week:
   - **Open Time** — When the store opens
   - **Close Time** — When the store closes
   - **Closed** — Toggle to mark a day as closed
3. Click **Save**

Business hours affect:
- Booking availability
- Auto clock-out timing
- Cash drawer auto-close
- Report date boundaries

## Holidays

1. Navigate to **Settings > Holidays** or **Admin > Holidays**
2. Click **Add Holiday**
3. Enter:
   - **Name** (e.g., "New Year's Day")
   - **Date**
   - **Recurring** — Toggle if it repeats annually
4. Click **Save**

Holidays mark dates as unavailable for bookings.

## Tax Rules

1. Navigate to **Settings > Tax Rules** or **Admin > Tax Rules**
2. Default rule: **12% VAT** (Philippine standard rate)
3. To add a custom rule:
   - Click **Add Tax Rule**
   - Enter name, rate, and applicability
   - Click **Save**
4. Assign tax rules to products in the product editor

### Standard Tax Types

| Type | Rate | Usage |
|------|------|-------|
| **VAT** | 12% | Standard Philippine VAT |
| **VAT-Exempt** | 0% | For exempt goods and services |
| **Zero-Rated** | 0% | For zero-rated exports |

## Receipt Templates

1. Navigate to **Settings > Receipt Templates**
2. Customize:
   - **Header** — Store name, address, TIN, contact info
   - **Footer** — Thank you message, return policy, etc.
   - **Logo** — Upload your store logo
   - **Fields** — Toggle which fields appear on receipts
3. Preview the receipt layout
4. Click **Save**

## Notification Templates

1. Navigate to **Settings > Notification Templates** or **Admin > Notification Templates**
2. Customize templates for:
   - Transaction receipts (email)
   - Booking confirmations
   - Booking reminders
   - Low stock alerts
   - Welcome messages
3. Use template variables (e.g., `{{customerName}}`, `{{totalAmount}}`)
4. Click **Save**

## Hardware Configuration

1. Navigate to **Settings > Hardware** or **Admin > Hardware**
2. Configure:

| Device | Settings |
|--------|----------|
| **Receipt Printer** | Printer type, connection, paper width |
| **Barcode Scanner** | Connection type, prefix/suffix settings |
| **Cash Drawer** | Trigger method, connected printer |

3. Click **Test Connection** to verify
4. Click **Save**

## Multi-Currency

1. Navigate to **Settings > Multi-Currency** or **Admin > Multi-Currency**
2. Set your **Base Currency** (e.g., PHP)
3. Add additional currencies:
   - Currency code
   - Exchange rate
   - Display format
4. Toggle **Auto-update exchange rates** if desired
5. Click **Save**

## Advanced Branding

1. Navigate to **Admin > Advanced Branding**
2. Customize:
   - **Logo** — Primary and secondary logos
   - **Colors** — Primary, secondary, accent colors
   - **Favicon** — Browser tab icon
3. Preview changes
4. Click **Save**

## Feature Flags

1. Navigate to **Admin > Feature Flags**
2. Toggle features on/off for your tenant:
   - Bookings
   - Multi-currency
   - Advanced analytics
   - Loyalty program
3. Available features depend on your subscription plan

## Backup & Data

1. Navigate to **Admin > Backup & Reset**
2. Options:
   - **Create Backup** — Generate a database backup now
   - **View Backups** — List of available backups
   - **Load Sample Data** — For testing (Admin > Sample Data)

> **Warning:** Data operations are irreversible. Always create a backup before making major changes.

## Automations

Automations run in the background on a schedule. Available automations include:

| Automation | Description | Schedule |
|-----------|-------------|----------|
| **Low Stock Alerts** | Email when stock is low | Every 6 hours |
| **Booking Reminders** | Send 24h reminders | Every hour |
| **Auto Clock-Out** | Clock out forgotten sessions | Every 30 min |
| **Report Delivery** | Email scheduled reports | Daily/Weekly |
| **Database Backup** | Automatic backups | Daily |
| **Data Archiving** | Archive old records | Monthly |
| **Audit Log Cleanup** | Trim old logs | Monthly |
| **Session Expiration** | Clean expired sessions | Every hour |

Configure each in **Settings > Automations** or via the individual Admin modules.
