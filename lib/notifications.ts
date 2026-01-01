/**
 * Notification service for sending emails and SMS
 * Supports multiple providers via environment variables
 */

import { ITenantSettings } from '@/models/Tenant';
import { formatDate, formatTime } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { renderNotificationTemplate, getDefaultTemplate } from '@/lib/notification-templates';

export interface NotificationOptions {
  to: string;
  subject?: string;
  message: string;
  type: 'email' | 'sms';
}

export interface BookingNotificationData {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  startTime: Date;
  endTime: Date;
  staffName?: string;
  notes?: string;
  bookingId: string;
}

/**
 * Send email notification
 * Supports multiple providers: Resend, SendGrid, SMTP (via nodemailer), or console logging
 */
export async function sendEmail(options: NotificationOptions): Promise<boolean> {
  try {
    const emailProvider = process.env.EMAIL_PROVIDER || 'console';
    const fromEmail = process.env.FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@localhost';

    // If no provider is configured, log to console (development mode)
    if (emailProvider === 'console' || !process.env.EMAIL_API_KEY) {
      console.log('📧 Email notification (console mode):', {
        to: options.to,
        from: fromEmail,
        subject: options.subject,
        message: options.message.substring(0, 200) + (options.message.length > 200 ? '...' : ''),
      });
      return true;
    }

    // Resend provider
    if (emailProvider === 'resend') {
      const resendApiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY or EMAIL_API_KEY is required when using Resend');
      }

      // Dynamic import to avoid requiring package at build time
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      const result = await resend.emails.send({
        from: fromEmail,
        to: options.to,
        subject: options.subject || 'Notification',
        text: options.message,
        html: options.message.replace(/\n/g, '<br>'),
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to send email via Resend');
      }

      return true;
    }

    // SendGrid provider
    if (emailProvider === 'sendgrid') {
      const sendgridApiKey = process.env.EMAIL_API_KEY || process.env.SENDGRID_API_KEY;
      if (!sendgridApiKey) {
        throw new Error('SENDGRID_API_KEY or EMAIL_API_KEY is required when using SendGrid');
      }

      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(sendgridApiKey);

      await sgMail.default.send({
        to: options.to,
        from: fromEmail,
        subject: options.subject || 'Notification',
        text: options.message,
        html: options.message.replace(/\n/g, '<br>'),
      });

      return true;
    }

    // SMTP provider (using nodemailer)
    if (emailProvider === 'smtp') {
      const nodemailer = await import('nodemailer');
      
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_API_KEY,
          pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: fromEmail,
        to: options.to,
        subject: options.subject || 'Notification',
        text: options.message,
        html: options.message.replace(/\n/g, '<br>'),
      });

      return true;
    }

    // Unknown provider
    console.warn(`Unknown email provider: ${emailProvider}, falling back to console logging`);
    console.log('📧 Email notification:', {
      to: options.to,
      from: fromEmail,
      subject: options.subject,
      message: options.message.substring(0, 200) + (options.message.length > 200 ? '...' : ''),
    });
    return true;
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Send SMS notification
 * Supports multiple providers: Twilio, AWS SNS, or console logging
 */
export async function sendSMS(options: NotificationOptions): Promise<boolean> {
  try {
    const smsProvider = process.env.SMS_PROVIDER || 'console';
    const fromPhone = process.env.SMS_FROM || process.env.TWILIO_PHONE;

    // If no provider is configured, log to console (development mode)
    if (smsProvider === 'console' || (!process.env.SMS_API_KEY && !process.env.TWILIO_ACCOUNT_SID)) {
      console.log('📱 SMS notification (console mode):', {
        to: options.to,
        from: fromPhone || 'N/A',
        message: options.message.substring(0, 160) + (options.message.length > 160 ? '...' : ''),
      });
      return true;
    }

    // Twilio provider
    if (smsProvider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.SMS_API_KEY;
      const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.SMS_PASSWORD;
      
      if (!accountSid || !authToken) {
        throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (or SMS_API_KEY and SMS_PASSWORD) are required when using Twilio');
      }

      if (!fromPhone) {
        throw new Error('TWILIO_PHONE or SMS_FROM is required when using Twilio');
      }

      const twilio = await import('twilio');
      const client = twilio.default(accountSid, authToken);

      const message = await client.messages.create({
        body: options.message,
        from: fromPhone,
        to: options.to,
      });

      if (message.errorCode) {
        throw new Error(`Twilio error: ${message.errorMessage || 'Unknown error'}`);
      }

      return true;
    }

    // AWS SNS provider
    if (smsProvider === 'aws-sns') {
      const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
      
      const snsClient = new SNSClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.SMS_API_KEY || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.SMS_PASSWORD || '',
        },
      });

      const command = new PublishCommand({
        PhoneNumber: options.to,
        Message: options.message,
      });

      await snsClient.send(command);
      return true;
    }

    // Unknown provider
    console.warn(`Unknown SMS provider: ${smsProvider}, falling back to console logging`);
    console.log('📱 SMS notification:', {
      to: options.to,
      from: fromPhone || 'N/A',
      message: options.message.substring(0, 160) + (options.message.length > 160 ? '...' : ''),
    });
    return true;
  } catch (error: any) {
    console.error('Failed to send SMS:', error);
    return false;
  }
}

/**
 * Send booking confirmation
 */
export async function sendBookingConfirmation(
  data: BookingNotificationData,
  settings?: ITenantSettings
): Promise<{ email: boolean; sms: boolean }> {
  const results = { email: false, sms: false };
  const tenantSettings = settings || getDefaultTenantSettings();

  // Check if notifications are enabled for this tenant
  if (!tenantSettings.emailNotifications && !tenantSettings.smsNotifications) {
    console.log('Notifications disabled for tenant, skipping booking confirmation');
    return results;
  }

  // Use template if available, otherwise use default message
  const emailTemplate = tenantSettings.notificationTemplates?.email?.bookingConfirmation;
  const smsTemplate = tenantSettings.notificationTemplates?.sms?.bookingConfirmation;

  let emailMessage = '';
  let smsMessage = '';

  if (emailTemplate) {
    // Template may contain subject|body format
    const parts = emailTemplate.split('|');
    emailMessage = parts.length > 1 ? parts[1] : parts[0];
    emailMessage = renderNotificationTemplate(emailMessage, {
      customerName: data.customerName,
      serviceName: data.serviceName,
      date: data.startTime,
      time: data.startTime,
      staffName: data.staffName,
      notes: data.notes,
      companyName: tenantSettings.companyName || 'Business',
    }, tenantSettings);
  } else {
    // Fallback to default template
    const defaultTemplate = getDefaultTemplate('email', 'booking', 'confirmation');
    if (defaultTemplate) {
      emailMessage = renderNotificationTemplate(defaultTemplate.body, {
        customerName: data.customerName,
        serviceName: data.serviceName,
        date: data.startTime,
        time: data.startTime,
        staffName: data.staffName,
        notes: data.notes,
        companyName: tenantSettings.companyName || 'Business',
      }, tenantSettings);
    } else {
      // Ultimate fallback
      const formattedDate = formatDate(data.startTime, tenantSettings);
      const formattedTime = formatTime(data.startTime, tenantSettings);
      emailMessage = `Your booking for ${data.serviceName} is confirmed.\n\n` +
        `Date: ${formattedDate}\n` +
        `Time: ${formattedTime}\n` +
        (data.staffName ? `Staff: ${data.staffName}\n` : '') +
        (data.notes ? `Notes: ${data.notes}\n` : '') +
        `\nWe look forward to seeing you!`;
    }
  }

  if (smsTemplate) {
    smsMessage = renderNotificationTemplate(smsTemplate, {
      customerName: data.customerName,
      serviceName: data.serviceName,
      date: data.startTime,
      time: data.startTime,
    }, tenantSettings);
  } else {
    const defaultTemplate = getDefaultTemplate('sms', 'booking', 'confirmation');
    if (defaultTemplate) {
      smsMessage = renderNotificationTemplate(defaultTemplate.body, {
        customerName: data.customerName,
        serviceName: data.serviceName,
        date: data.startTime,
        time: data.startTime,
      }, tenantSettings);
    } else {
      const formattedDate = formatDate(data.startTime, tenantSettings);
      const formattedTime = formatTime(data.startTime, tenantSettings);
      smsMessage = `Hi ${data.customerName}, your booking for ${data.serviceName} is confirmed for ${formattedDate} at ${formattedTime}. See you soon!`;
    }
  }

  const message = emailMessage || smsMessage;

  // Send email if email is provided and email notifications are enabled
  if (data.customerEmail && tenantSettings.emailNotifications) {
    const emailTemplate = tenantSettings.notificationTemplates?.email?.bookingConfirmation;
    let subject = `Booking Confirmation: ${data.serviceName}`;
    if (emailTemplate && emailTemplate.includes('|')) {
      subject = emailTemplate.split('|')[0];
      subject = renderNotificationTemplate(subject, {
        serviceName: data.serviceName,
      }, tenantSettings);
    }
    results.email = await sendEmail({
      to: data.customerEmail,
      subject,
      message: emailMessage,
      type: 'email',
    });
  }

  // Send SMS if phone is provided and SMS notifications are enabled
  if (data.customerPhone && tenantSettings.smsNotifications) {
    results.sms = await sendSMS({
      to: data.customerPhone,
      message: smsMessage,
      type: 'sms',
    });
  }

  return results;
}

/**
 * Send booking reminder
 */
export async function sendBookingReminder(
  data: BookingNotificationData,
  settings?: ITenantSettings
): Promise<{ email: boolean; sms: boolean }> {
  const results = { email: false, sms: false };
  const tenantSettings = settings || getDefaultTenantSettings();

  // Check if notifications are enabled for this tenant
  if (!tenantSettings.emailNotifications && !tenantSettings.smsNotifications) {
    console.log('Notifications disabled for tenant, skipping booking reminder');
    return results;
  }

  // Use template if available
  const emailTemplate = tenantSettings.notificationTemplates?.email?.bookingReminder;
  const smsTemplate = tenantSettings.notificationTemplates?.sms?.bookingReminder;

  let emailMessage = '';
  let smsMessage = '';

  if (emailTemplate) {
    const parts = emailTemplate.split('|');
    emailMessage = parts.length > 1 ? parts[1] : parts[0];
    emailMessage = renderNotificationTemplate(emailMessage, {
      customerName: data.customerName,
      serviceName: data.serviceName,
      date: data.startTime,
      time: data.startTime,
      staffName: data.staffName,
      companyName: tenantSettings.companyName || 'Business',
    }, tenantSettings);
  } else {
    const defaultTemplate = getDefaultTemplate('email', 'booking', 'reminder');
    if (defaultTemplate) {
      emailMessage = renderNotificationTemplate(defaultTemplate.body, {
        customerName: data.customerName,
        serviceName: data.serviceName,
        date: data.startTime,
        time: data.startTime,
        staffName: data.staffName,
        companyName: tenantSettings.companyName || 'Business',
      }, tenantSettings);
    } else {
      const formattedDate = formatDate(data.startTime, tenantSettings);
      const formattedTime = formatTime(data.startTime, tenantSettings);
      emailMessage = `Reminder: You have a booking for ${data.serviceName}.\n\n` +
        `Date: ${formattedDate}\n` +
        `Time: ${formattedTime}\n` +
        (data.staffName ? `Staff: ${data.staffName}\n` : '') +
        `\nSee you soon!`;
    }
  }

  if (smsTemplate) {
    smsMessage = renderNotificationTemplate(smsTemplate, {
      customerName: data.customerName,
      serviceName: data.serviceName,
      date: data.startTime,
      time: data.startTime,
    }, tenantSettings);
  } else {
    const defaultTemplate = getDefaultTemplate('sms', 'booking', 'reminder');
    if (defaultTemplate) {
      smsMessage = renderNotificationTemplate(defaultTemplate.body, {
        customerName: data.customerName,
        serviceName: data.serviceName,
        date: data.startTime,
        time: data.startTime,
      }, tenantSettings);
    } else {
      const formattedDate = formatDate(data.startTime, tenantSettings);
      const formattedTime = formatTime(data.startTime, tenantSettings);
      smsMessage = `Reminder: You have a booking for ${data.serviceName} on ${formattedDate} at ${formattedTime}. See you soon!`;
    }
  }

  const message = emailMessage || smsMessage;

  // Send email if email is provided and email notifications are enabled
  if (data.customerEmail && tenantSettings.emailNotifications) {
    const emailTemplate = tenantSettings.notificationTemplates?.email?.bookingReminder;
    let subject = `Reminder: ${data.serviceName} Booking`;
    if (emailTemplate && emailTemplate.includes('|')) {
      subject = emailTemplate.split('|')[0];
      subject = renderNotificationTemplate(subject, {
        serviceName: data.serviceName,
      }, tenantSettings);
    }
    results.email = await sendEmail({
      to: data.customerEmail,
      subject,
      message: emailMessage,
      type: 'email',
    });
  }

  // Send SMS if phone is provided and SMS notifications are enabled
  if (data.customerPhone && tenantSettings.smsNotifications) {
    results.sms = await sendSMS({
      to: data.customerPhone,
      message: smsMessage,
      type: 'sms',
    });
  }

  return results;
}

/**
 * Send attendance notification email
 */
export interface AttendanceNotificationData {
  userName: string;
  userEmail: string;
  type: 'late_arrival' | 'missing_clock_out';
  clockInTime: Date | string;
  hoursSinceClockIn?: number;
  minutesLate?: number;
  expectedTime?: Date | string;
  message: string;
}

export async function sendAttendanceNotification(
  data: AttendanceNotificationData,
  settings?: ITenantSettings
): Promise<boolean> {
  try {
    const tenantSettings = settings || getDefaultTenantSettings();

    // Check if email notifications are enabled for this tenant
    if (!tenantSettings.emailNotifications) {
      console.log('Email notifications disabled for tenant, skipping attendance notification');
      return false;
    }

    const clockInDate = formatDate(data.clockInTime, tenantSettings);
    const clockInTime = formatTime(data.clockInTime, tenantSettings);
    
    let subject = '';
    let emailBody = '';
    
    if (data.type === 'late_arrival') {
      subject = `Late Arrival Alert: ${data.userName}`;
      emailBody = `
Hello ${data.userName},

This is an automated notification regarding your attendance.

You clocked in late on ${clockInDate} at ${clockInTime}.
${data.minutesLate ? `You were ${data.minutesLate} minutes late.` : ''}
${data.expectedTime ? `Expected time: ${formatTime(data.expectedTime, tenantSettings)}` : ''}

${data.message}

Please ensure you arrive on time for your scheduled shifts.

Best regards,
Attendance Management System
      `.trim();
    } else if (data.type === 'missing_clock_out') {
      subject = `Missing Clock-Out Alert: ${data.userName}`;
      emailBody = `
Hello ${data.userName},

This is an automated notification regarding your attendance.

You clocked in on ${clockInDate} at ${clockInTime} but have not yet clocked out.
${data.hoursSinceClockIn ? `You have been clocked in for ${data.hoursSinceClockIn.toFixed(1)} hours.` : ''}

${data.message}

Please remember to clock out at the end of your shift.

Best regards,
Attendance Management System
      `.trim();
    }

    return await sendEmail({
      to: data.userEmail,
      subject,
      message: emailBody,
      type: 'email',
    });
  } catch (error) {
    console.error('Failed to send attendance notification:', error);
    return false;
  }
}

/**
 * Send booking cancellation notification
 */
export async function sendBookingCancellation(
  data: BookingNotificationData,
  settings?: ITenantSettings
): Promise<{ email: boolean; sms: boolean }> {
  const results = { email: false, sms: false };
  const tenantSettings = settings || getDefaultTenantSettings();

  // Check if notifications are enabled for this tenant
  if (!tenantSettings.emailNotifications && !tenantSettings.smsNotifications) {
    console.log('Notifications disabled for tenant, skipping booking cancellation');
    return results;
  }

  const formattedDate = formatDate(data.startTime, tenantSettings);
  const formattedTime = formatTime(data.startTime, tenantSettings);

  const message = `Your booking for ${data.serviceName} has been cancelled.\n\n` +
    `Original Date: ${formattedDate}\n` +
    `Original Time: ${formattedTime}\n` +
    `\nIf you need to reschedule, please contact us.`;

  // Send email if email is provided and email notifications are enabled
  if (data.customerEmail && tenantSettings.emailNotifications) {
    results.email = await sendEmail({
      to: data.customerEmail,
      subject: `Booking Cancelled: ${data.serviceName}`,
      message,
      type: 'email',
    });
  }

  // Send SMS if phone is provided and SMS notifications are enabled
  if (data.customerPhone && tenantSettings.smsNotifications) {
    results.sms = await sendSMS({
      to: data.customerPhone,
      message,
      type: 'sms',
    });
  }

  return results;
}
