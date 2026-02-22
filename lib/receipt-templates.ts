/**
 * Receipt Template System
 * Manages custom receipt templates with variable substitution
 */

export interface ReceiptTemplate {
  id: string;
  name: string;
  html: string;
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReceiptData {
  storeName?: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  receiptNumber: string;
  date: string;
  time: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    sku?: string;
  }>;
  subtotal: number;
  discount?: number;
  tax?: number;
  taxLabel?: string;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  footer?: string;
  header?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

/**
 * Default receipt template
 */
export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  id: 'default',
  name: 'Default Template',
  html: `<!DOCTYPE html>
<html>
<head>
  <title>Receipt</title>
  <style>
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0; padding: 10px; }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      margin: 0 auto;
      padding: 10px;
    }
    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
    .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .total { border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; font-weight: bold; }
    .footer { text-align: center; margin-top: 20px; font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    {{#if storeName}}<h2>{{storeName}}</h2>{{/if}}
    {{#if logo}}<img src="{{logo}}" alt="Logo" style="max-width: 100px; max-height: 60px;" />{{/if}}
    <p>Receipt #{{receiptNumber}}</p>
    <p>{{date}} {{time}}</p>
    {{#if address}}<p>{{address}}</p>{{/if}}
    {{#if phone}}<p>{{phone}}</p>{{/if}}
    {{#if email}}<p>{{email}}</p>{{/if}}
    {{#if header}}<p>{{header}}</p>{{/if}}
  </div>
  {{#each items}}
  <div class="item">
    <div>
      <div>{{name}} x{{quantity}}</div>
      <div style="font-size: 10px;">@ {{price}}</div>
    </div>
    <div>{{subtotal}}</div>
  </div>
  {{/each}}
  <div class="total">
    <div class="item">
      <div>Subtotal:</div>
      <div>{{subtotal}}</div>
    </div>
    {{#if discount}}
    <div class="item">
      <div>Discount:</div>
      <div>-{{discount}}</div>
    </div>
    {{/if}}
    {{#if tax}}
    <div class="item">
      <div>{{taxLabel}}:</div>
      <div>{{tax}}</div>
    </div>
    {{/if}}
    <div class="item">
      <div>TOTAL:</div>
      <div>{{total}}</div>
    </div>
    <div class="item">
      <div>Payment:</div>
      <div>{{paymentMethod}}</div>
    </div>
    {{#if cashReceived}}
    <div class="item">
      <div>Cash:</div>
      <div>{{cashReceived}}</div>
    </div>
    {{/if}}
    {{#if change}}
    <div class="item">
      <div>Change:</div>
      <div>{{change}}</div>
    </div>
    {{/if}}
  </div>
  {{#if footer}}<div class="footer">{{footer}}</div>{{/if}}
</body>
</html>`,
  isDefault: true,
};

/**
 * Simple template engine for receipt rendering
 * Supports Handlebars-like syntax: {{variable}}, {{#if condition}}, {{#each array}}
 */
export function renderReceiptTemplate(template: string, data: ReceiptData): string {
  let html = template;

  // Replace simple variables {{variable}}
  html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = (data as any)[key]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return value !== undefined && value !== null ? String(value) : '';
  });

  // Handle {{#if condition}} blocks
  html = html.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
    const value = (data as any)[condition]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (value && value !== false && value !== '' && value !== 0) {
      // Recursively process nested content
      return processTemplateContent(content, data);
    }
    return '';
  });

  // Handle {{#each array}} blocks
  html = html.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayKey, content) => {
    const array = (data as any)[arrayKey]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (Array.isArray(array)) {
      return array.map((item, index) => {
        // Create a context with item properties and index
        const itemContext = { ...data, ...item, index, '@index': index };
        return processTemplateContent(content, itemContext);
      }).join('');
    }
    return '';
  });

  return html;
}

/**
 * Process template content recursively
 */
function processTemplateContent(content: string, data: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  let processed = content;

  // Replace variables
  processed = processed.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    return value !== undefined && value !== null ? String(value) : '';
  });

  // Handle nested if blocks
  processed = processed.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, nestedContent) => {
    const value = data[condition];
    if (value && value !== false && value !== '' && value !== 0) {
      return processTemplateContent(nestedContent, data);
    }
    return '';
  });

  return processed;
}

/**
 * Get default template if none exists
 */
export function getDefaultTemplate(): ReceiptTemplate {
  return DEFAULT_RECEIPT_TEMPLATE;
}

/**
 * Validate template HTML
 */
export function validateTemplate(html: string): { valid: boolean; error?: string } {
  try {
    // Basic validation - check for required variables
    const requiredVars = ['receiptNumber', 'date', 'total'];
    const missing = requiredVars.filter((varName) => !html.includes(`{{${varName}}}`) && !html.includes(`{{#each ${varName}}}`));
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required variables: ${missing.join(', ')}`,
      };
    }

    // Check for balanced tags
    const ifMatches = html.match(/\{\{#if/g) || [];
    const endIfMatches = html.match(/\{\{\/if\}\}/g) || [];
    if (ifMatches.length !== endIfMatches.length) {
      return {
        valid: false,
        error: 'Unbalanced {{#if}} tags',
      };
    }

    const eachMatches = html.match(/\{\{#each/g) || [];
    const endEachMatches = html.match(/\{\{\/each\}\}/g) || [];
    if (eachMatches.length !== endEachMatches.length) {
      return {
        valid: false,
        error: 'Unbalanced {{#each}} tags',
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
