# Notifications Setup Guide

This guide explains how to configure email and SMS notifications in the POS system.

## Overview

The notification system supports multiple providers for both email and SMS. The system will:
- Send booking confirmations, reminders, and cancellations
- Send attendance notifications (late arrival, missing clock-out)
- Respect tenant-level notification settings (emailNotifications, smsNotifications)
- Fall back to console logging in development mode if no provider is configured

## Email Configuration

### Option 1: Resend (Recommended)

1. Install the package:
```bash
npm install resend
```

2. Get your API key from [Resend](https://resend.com)

3. Set environment variables:
```env
EMAIL_PROVIDER=resend
EMAIL_API_KEY=re_xxxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com
```

### Option 2: SendGrid

1. Install the package:
```bash
npm install @sendgrid/mail
```

2. Get your API key from [SendGrid](https://sendgrid.com)

3. Set environment variables:
```env
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=SG.xxxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com
```

### Option 3: SMTP (using nodemailer)

1. Install the package:
```bash
npm install nodemailer
```

2. Set environment variables:
```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=your-email@gmail.com
```

### Option 4: Console (Development Mode)

If no provider is configured or `EMAIL_PROVIDER=console`, notifications will be logged to the console. This is the default behavior in development.

## SMS Configuration

### Option 1: Twilio (Recommended)

1. Install the package:
```bash
npm install twilio
```

2. Get your credentials from [Twilio](https://twilio.com):
   - Account SID
   - Auth Token
   - Phone Number

3. Set environment variables:
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1234567890
# Or use generic names:
SMS_API_KEY=ACxxxxxxxxxxxxx
SMS_PASSWORD=your_auth_token
SMS_FROM=+1234567890
```

### Option 2: AWS SNS

1. Install the package:
```bash
npm install @aws-sdk/client-sns
```

2. Set environment variables:
```env
SMS_PROVIDER=aws-sns
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
# Or use generic names:
SMS_API_KEY=your_access_key
SMS_PASSWORD=your_secret_key
```

### Option 3: Console (Development Mode)

If no provider is configured or `SMS_PROVIDER=console`, notifications will be logged to the console. This is the default behavior in development.

## Tenant Settings

Each tenant can enable/disable notifications in their settings:

```json
{
  "emailNotifications": true,
  "smsNotifications": true
}
```

These settings are checked before sending any notification. If both are disabled, notifications will be skipped.

## Notification Types

### Booking Notifications

- **Booking Confirmation**: Sent when a booking is created or updated to "confirmed" status
- **Booking Reminder**: Sent for upcoming bookings (typically via cron job)
- **Booking Cancellation**: Sent when a booking is cancelled

All booking notifications include:
- Customer name
- Service name
- Date and time (formatted according to tenant settings)
- Staff name (if assigned)
- Notes (if provided)

### Attendance Notifications

- **Late Arrival**: Sent when an employee clocks in after the expected time
- **Missing Clock-Out**: Sent when an employee has been clocked in for an extended period

## Testing

To test notifications in development:

1. Use console mode (default) - notifications will be logged to the console
2. Check tenant settings to ensure notifications are enabled
3. Create/update bookings or trigger attendance events
4. Check console logs for notification details

## Production Setup

1. Choose your email and SMS providers
2. Install the required packages
3. Set up environment variables
4. Configure your providers (verify domains, phone numbers, etc.)
5. Test with a real email/phone number
6. Monitor logs for any delivery issues

## Environment Variables Summary

```env
# Email Configuration
EMAIL_PROVIDER=resend|sendgrid|smtp|console
EMAIL_API_KEY=your_api_key
FROM_EMAIL=noreply@yourdomain.com

# SMTP-specific (if using smtp provider)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password

# SMS Configuration
SMS_PROVIDER=twilio|aws-sns|console
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1234567890
# Or use generic names:
SMS_API_KEY=your_api_key
SMS_PASSWORD=your_password
SMS_FROM=+1234567890

# AWS SNS (if using aws-sns provider)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Troubleshooting

1. **Notifications not sending**: Check that tenant settings have notifications enabled
2. **Email not delivered**: Verify API keys, check spam folder, verify sender domain
3. **SMS not delivered**: Verify phone number format (E.164 format: +1234567890), check account credits
4. **Console mode**: If you see console logs instead of actual notifications, check that providers are configured correctly
