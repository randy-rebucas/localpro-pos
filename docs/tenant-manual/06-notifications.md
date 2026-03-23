# 6. Notification Configuration

## Overview

1POS supports email and SMS notifications for various business events. Notifications require external provider configuration.

## Email Providers

Configure one of the following in your environment:

| Provider | Environment Variables |
|----------|--------------------|
| **Resend** | `RESEND_API_KEY` |
| **SendGrid** | `SENDGRID_API_KEY` |
| **SMTP** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| **AWS SES** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |

### Enabling Email

1. Set up the provider credentials in environment variables
2. Navigate to **Settings**
3. Toggle **Email Notifications** to ON
4. Click **Save**

## SMS Providers

| Provider | Environment Variables |
|----------|--------------------|
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **AWS SNS** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |

### Enabling SMS

1. Set up the provider credentials in environment variables
2. Navigate to **Settings**
3. Toggle **SMS Notifications** to ON
4. Click **Save**

## Notification Events

### Automatic Notifications

| Event | Channel | Recipient | Trigger |
|-------|---------|-----------|---------|
| **Transaction Receipt** | Email | Customer | After completed sale |
| **Booking Confirmation** | Email + SMS | Customer | When booking is created |
| **Booking Reminder** | Email + SMS | Customer | 24 hours before appointment |
| **Booking Cancellation** | Email + SMS | Customer | When booking is cancelled |
| **Low Stock Alert** | Email | Manager/Admin | Stock below threshold |
| **Attendance Alert** | Email | Manager | Late arrival or missed clock-out |
| **Welcome Message** | Email | Customer | First time added (if automation enabled) |

### Automation-Triggered Notifications

These require the corresponding automation to be enabled:

| Automation | Notification | Schedule |
|-----------|-------------|----------|
| Low Stock Alerts | Email to managers | Every 6 hours |
| Booking Reminders | Email/SMS to customers | Hourly check |
| Auto Clock-Out | Notification to staff + manager | Every 30 min |
| Cash Count Reminders | Notification to cashiers | Configurable |
| Attendance Violations | Email to managers | Daily |
| Report Delivery | Email with attached report | Daily/Weekly/Monthly |
| Suspicious Activity | Email to admins | Real-time |

## Notification Templates

Navigate to **Admin > Notification Templates** or **Settings > Notification Templates**.

### Email Templates

| Template | Variables Available |
|----------|--------------------|
| **Booking Confirmation** | `{{customerName}}`, `{{serviceName}}`, `{{date}}`, `{{time}}`, `{{staffName}}`, `{{storeName}}` |
| **Booking Reminder** | Same as confirmation + `{{hoursUntil}}` |
| **Booking Cancellation** | Same as confirmation + `{{reason}}` |
| **Low Stock Alert** | `{{productName}}`, `{{currentStock}}`, `{{threshold}}`, `{{storeName}}` |
| **Attendance Alert** | `{{staffName}}`, `{{expectedTime}}`, `{{actualTime}}`, `{{storeName}}` |

### SMS Templates

Same templates available but shorter format for SMS character limits.

### Editing Templates

1. Navigate to **Admin > Notification Templates**
2. Select the template type (email or SMS)
3. Select the event (booking confirmation, low stock, etc.)
4. Edit the template content using the available variables
5. Preview the result
6. Click **Save**

### Template Variables

Variables use double curly braces: `{{variableName}}`

Available in all templates:
- `{{storeName}}` — Your store name
- `{{storePhone}}` — Store phone number
- `{{storeEmail}}` — Store email
- `{{storeAddress}}` — Store address
- `{{date}}` — Current date (formatted per tenant settings)

## Attendance Notifications

Special configuration for attendance alerts:

| Setting | Default | Description |
|---------|---------|-------------|
| **Enabled** | Yes | Toggle attendance notifications |
| **Expected Start Time** | `09:00` | When staff should clock in |
| **Max Hours Without Clock-Out** | 12 | Auto clock-out threshold |

When a staff member clocks in after the expected start time, a notification is sent to their Manager.

## Testing Notifications

1. Ensure provider is configured and enabled
2. Create a test booking to trigger a confirmation email
3. Check the customer's email for delivery
4. Review server logs for any send errors

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Emails not sending | Check provider API key, verify `emailNotifications` is enabled |
| SMS not sending | Check Twilio credentials, verify `smsNotifications` is enabled |
| Wrong template content | Check template variables match exactly (case-sensitive) |
| Emails going to spam | Configure SPF/DKIM records for your sending domain |
| Rate limits | Check provider rate limits; 1POS batches notifications |
