/**
 * Notification Template System
 * Manages email and SMS templates with variable substitution
 */

import { ITenantSettings } from '@/models/Tenant';
import { formatDate, formatTime } from './formatting';

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms';
  category: 'booking' | 'stock' | 'attendance' | 'transaction' | 'billing';
  subject?: string; // For email only
  body: string;
  variables?: string[]; // Available variables
}

export interface TemplateVariables {
  [key: string]: string | number | Date | undefined;
}

/**
 * Default notification templates
 */
export const DEFAULT_NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  email_booking_confirmation: {
    id: 'email_booking_confirmation',
    name: 'Booking Confirmation (Email)',
    type: 'email',
    category: 'booking',
    subject: 'Booking Confirmation: {{serviceName}}',
    body: `Hello {{customerName}},

Your booking for {{serviceName}} is confirmed.

Date: {{date}}
Time: {{time}}
{{#if staffName}}Staff: {{staffName}}{{/if}}
{{#if notes}}Notes: {{notes}}{{/if}}

We look forward to seeing you!

Best regards,
{{companyName}}`,
    variables: ['customerName', 'serviceName', 'date', 'time', 'staffName', 'notes', 'companyName'],
  },
  sms_booking_confirmation: {
    id: 'sms_booking_confirmation',
    name: 'Booking Confirmation (SMS)',
    type: 'sms',
    category: 'booking',
    body: `Hi {{customerName}}, your booking for {{serviceName}} is confirmed for {{date}} at {{time}}. See you soon!`,
    variables: ['customerName', 'serviceName', 'date', 'time'],
  },
  email_booking_reminder: {
    id: 'email_booking_reminder',
    name: 'Booking Reminder (Email)',
    type: 'email',
    category: 'booking',
    subject: 'Reminder: {{serviceName}} Booking',
    body: `Hello {{customerName}},

This is a reminder that you have a booking for {{serviceName}}.

Date: {{date}}
Time: {{time}}
{{#if staffName}}Staff: {{staffName}}{{/if}}

See you soon!

Best regards,
{{companyName}}`,
    variables: ['customerName', 'serviceName', 'date', 'time', 'staffName', 'companyName'],
  },
  sms_booking_reminder: {
    id: 'sms_booking_reminder',
    name: 'Booking Reminder (SMS)',
    type: 'sms',
    category: 'booking',
    body: `Reminder: You have a booking for {{serviceName}} on {{date}} at {{time}}. See you soon!`,
    variables: ['customerName', 'serviceName', 'date', 'time'],
  },
  email_low_stock: {
    id: 'email_low_stock',
    name: 'Low Stock Alert (Email)',
    type: 'email',
    category: 'stock',
    subject: 'Low Stock Alert: {{productName}}',
    body: `Hello,

This is an automated alert that the following product is running low on stock:

Product: {{productName}}
SKU: {{sku}}
Current Stock: {{currentStock}}
Threshold: {{threshold}}

Please consider restocking soon.

Best regards,
{{companyName}}`,
    variables: ['productName', 'sku', 'currentStock', 'threshold', 'companyName'],
  },
  sms_low_stock: {
    id: 'sms_low_stock',
    name: 'Low Stock Alert (SMS)',
    type: 'sms',
    category: 'stock',
    body: `Low stock alert: {{productName}} ({{sku}}) has {{currentStock}} units remaining. Threshold: {{threshold}}`,
    variables: ['productName', 'sku', 'currentStock', 'threshold'],
  },
  email_invoice_generated: {
    id: 'email_invoice_generated',
    name: 'Invoice Generated (Email)',
    type: 'email',
    category: 'billing',
    subject: 'Upcoming Payment: Invoice {{invoiceNumber}} for {{companyName}}',
    body: `Hello,

Your next subscription payment for {{companyName}} is coming up.

Invoice: {{invoiceNumber}}
Amount Due: {{amount}}
Due Date: {{dueDate}}

Please settle this invoice on or before the due date to avoid any service interruption.

Best regards,
Billing Team`,
    variables: ['companyName', 'invoiceNumber', 'amount', 'dueDate'],
  },
  email_payment_reminder: {
    id: 'email_payment_reminder',
    name: 'Payment Reminder - Grace Period (Email)',
    type: 'email',
    category: 'billing',
    subject: 'Payment Overdue: Invoice {{invoiceNumber}} for {{companyName}}',
    body: `Hello,

Your invoice {{invoiceNumber}} for {{companyName}} was due on {{dueDate}} and remains unpaid.

Amount Due: {{amount}}

You have until {{gracePeriodEndDate}} to settle this invoice before your account is deactivated. Please pay now to avoid service interruption.

Best regards,
Billing Team`,
    variables: ['companyName', 'invoiceNumber', 'amount', 'dueDate', 'gracePeriodEndDate'],
  },
  email_payment_overdue_final_notice: {
    id: 'email_payment_overdue_final_notice',
    name: 'Final Notice Before Deactivation (Email)',
    type: 'email',
    category: 'billing',
    subject: 'Final Notice: {{companyName}} Account Will Be Deactivated Soon',
    body: `Hello,

This is a final notice. Invoice {{invoiceNumber}} for {{companyName}} is still unpaid.

Amount Due: {{amount}}

Your account will be deactivated on {{deactivationDate}} unless payment is received. Please settle your invoice now or contact support to make arrangements.

Best regards,
Billing Team`,
    variables: ['companyName', 'invoiceNumber', 'amount', 'deactivationDate'],
  },
  email_account_deactivated: {
    id: 'email_account_deactivated',
    name: 'Account Deactivated (Email)',
    type: 'email',
    category: 'billing',
    subject: 'Account Deactivated: {{companyName}}',
    body: `Hello,

Your account for {{companyName}} has been deactivated due to non-payment of invoice {{invoiceNumber}} (Amount Due: {{amount}}).

Please settle your outstanding balance to restore access. Note that unpaid balances accrue a late charge after 15 days and a reactivation fee after 30 days.

Contact support if you need assistance.

Best regards,
Billing Team`,
    variables: ['companyName', 'invoiceNumber', 'amount'],
  },
};

/**
 * Render notification template with variables
 */
export function renderNotificationTemplate(
  template: string,
  variables: TemplateVariables,
  settings?: ITenantSettings
): string {
  let rendered = template;

  // Format dates if they exist and settings are provided
  if (settings) {
    if (variables.date && variables.date instanceof Date) {
      variables.date = formatDate(variables.date, settings);
    }
    if (variables.time && variables.time instanceof Date) {
      variables.time = formatTime(variables.time, settings);
    }
    if (variables.startTime && variables.startTime instanceof Date) {
      variables.startTime = formatTime(variables.startTime, settings);
    }
    if (variables.endTime && variables.endTime instanceof Date) {
      variables.endTime = formatTime(variables.endTime, settings);
    }
  } else {
    // Use default formatting if settings not provided
    if (variables.date && variables.date instanceof Date) {
      variables.date = variables.date.toLocaleDateString();
    }
    if (variables.time && variables.time instanceof Date) {
      variables.time = variables.time.toLocaleTimeString();
    }
    if (variables.startTime && variables.startTime instanceof Date) {
      variables.startTime = variables.startTime.toLocaleTimeString();
    }
    if (variables.endTime && variables.endTime instanceof Date) {
      variables.endTime = variables.endTime.toLocaleTimeString();
    }
  }

  // Replace simple variables {{variable}}
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined && value !== null ? String(value) : '';
  });

  // Handle {{#if condition}} blocks
  rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
    const value = variables[condition];
    // Check if value exists and is truthy (not empty string, not 0, not undefined/null)
    if (value !== undefined && value !== null && value !== '' && value !== 0) {
      return processTemplateContent(content, variables);
    }
    return '';
  });

  return rendered;
}

/**
 * Process template content recursively
 */
function processTemplateContent(content: string, variables: TemplateVariables): string {
  let processed = content;

  // Replace variables
  processed = processed.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined && value !== null ? String(value) : '';
  });

  // Handle nested if blocks
  processed = processed.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, nestedContent) => {
    const value = variables[condition];
    // Check if value exists and is truthy (not empty string, not 0, not undefined/null)
    if (value !== undefined && value !== null && value !== '' && value !== 0) {
      return processTemplateContent(nestedContent, variables);
    }
    return '';
  });

  return processed;
}

/**
 * Get default template for a notification type
 */
export function getDefaultTemplate(
  type: 'email' | 'sms',
  category: 'booking' | 'stock' | 'attendance' | 'transaction' | 'billing',
  subcategory?: string
): NotificationTemplate | null {
  const key = `${type}_${category}${subcategory ? `_${subcategory}` : ''}`;
  return DEFAULT_NOTIFICATION_TEMPLATES[key] || null;
}

/**
 * Extract variables from template
 */
export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  
  // Find all {{variable}} patterns
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  for (const match of matches) {
    variables.add(match[1]);
  }

  // Find variables in {{#if variable}} blocks
  const ifMatches = template.matchAll(/\{\{#if\s+(\w+)\}\}/g);
  for (const match of ifMatches) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Validate template
 */
export function validateNotificationTemplate(template: string): { valid: boolean; error?: string } {
  try {
    // Check for balanced tags
    const ifMatches = template.match(/\{\{#if/g) || [];
    const endIfMatches = template.match(/\{\{\/if\}\}/g) || [];
    if (ifMatches.length !== endIfMatches.length) {
      return {
        valid: false,
        error: 'Unbalanced {{#if}} tags',
      };
    }

    return { valid: true };
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      valid: false,
      error: error.message || 'Invalid template',
    };
  }
}
