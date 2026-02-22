/**
 * New Customer Welcome Emails
 * Sends welcome emails when new customers are added
 */

import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Tenant from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface CustomerWelcomeOptions {
  customerId: string;
  tenantId: string;
}

/**
 * Send welcome email to new customer
 */
export async function sendCustomerWelcomeEmail(
  options: CustomerWelcomeOptions
): Promise<AutomationResult> {
  await connectDB();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const customer = await Customer.findById(options.customerId).lean();
    if (!customer) {
      results.success = false;
      results.message = 'Customer not found';
      return results;
    }

    if (!customer.email) {
      results.message = 'Customer has no email address';
      return results;
    }

    const tenant = await Tenant.findById(options.tenantId).lean();
    if (!tenant) {
      results.success = false;
      results.message = 'Tenant not found';
      return results;
    }

    const tenantSettings = await getTenantSettingsById(options.tenantId);

    // Check if email notifications are enabled
    if (!tenantSettings?.emailNotifications) {
      results.message = 'Email notifications disabled for this tenant';
      return results;
    }

    const companyName = tenantSettings?.companyName || tenant.name || 'Business';
    const customerName = `${customer.firstName} ${customer.lastName}`;

    // Build welcome email
    const welcomeHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .content { margin-bottom: 20px; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Welcome to ${companyName}!</h2>
    </div>

    <div class="content">
      <p>Hello ${customerName},</p>
      
      <p>Thank you for joining us! We're excited to have you as a valued customer.</p>
      
      ${tenantSettings?.enableLoyaltyProgram ? `
      <p><strong>Loyalty Program:</strong> As a member, you'll earn points with every purchase and enjoy exclusive benefits and rewards.</p>
      ` : ''}
      
      <p>We're here to serve you and provide the best experience possible. If you have any questions or need assistance, please don't hesitate to reach out to us.</p>
      
      ${tenantSettings?.phone ? `<p><strong>Contact Us:</strong> ${tenantSettings.phone}</p>` : ''}
      ${tenantSettings?.email ? `<p><strong>Email:</strong> ${tenantSettings.email}</p>` : ''}
      ${tenantSettings?.address ? `
      <p><strong>Address:</strong><br>
      ${[tenantSettings.address.street, tenantSettings.address.city, tenantSettings.address.state, tenantSettings.address.zipCode].filter(Boolean).join('<br>')}
      </p>
      ` : ''}
      
      <p>We look forward to serving you!</p>
      
      <p>Best regards,<br>
      The ${companyName} Team</p>
    </div>

    <div class="footer">
      <p>This is an automated welcome email from ${companyName}.</p>
      <p>If you did not create an account, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    await sendEmail({
      to: customer.email,
      subject: `Welcome to ${companyName}!`,
      message: welcomeHtml,
      type: 'email',
    });

    results.processed = 1;
    results.message = 'Welcome email sent successfully';

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending welcome email: ${error.message}`;
    results.errors?.push(error.message);
    results.failed = 1;
    return results;
  }
}
