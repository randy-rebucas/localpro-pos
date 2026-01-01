# Future Enhancements Implementation

This document describes the implementation of the future enhancements for the POS system.

## Overview

The following enhancements have been implemented:

1. **Multi-Currency Support** - Display prices in multiple currencies with exchange rate management
2. **Custom Receipt Templates** - Template system for customizing receipt appearance
3. **Email/SMS Notification Templates** - Customizable notification templates with variable substitution
4. **Advanced Branding** - Custom fonts, themes, and CSS customization
5. **Regional Tax Rules** - Multiple tax rates based on region, product type, or category
6. **Business Hours Configuration** - Weekly schedule and special hours management
7. **Holiday Calendars** - Holiday management with recurring holiday support

## Implementation Details

### 1. Multi-Currency Support

**Files Created:**
- `lib/multi-currency.ts` - Currency conversion and exchange rate management
- `app/api/tenants/[slug]/exchange-rates/route.ts` - API for managing exchange rates

**Features:**
- Support for displaying prices in multiple currencies
- Exchange rate fetching from external APIs (exchangerate-api.com, Fixer.io)
- Manual exchange rate management
- Automatic currency conversion

**Usage:**
```typescript
import { formatMultiCurrency, convertCurrency } from '@/lib/multi-currency';

// Convert amount
const converted = convertCurrency(100, 'USD', 'EUR', exchangeRates);

// Format in multiple currencies
const formatted = formatMultiCurrency(100, 'USD', ['EUR', 'GBP'], exchangeRates, settings);
```

**API Endpoints:**
- `GET /api/tenants/{slug}/exchange-rates` - Get current exchange rates
- `POST /api/tenants/{slug}/exchange-rates` - Fetch or update exchange rates

### 2. Custom Receipt Templates

**Files Created:**
- `lib/receipt-templates.ts` - Receipt template engine and management
- `app/api/tenants/[slug]/receipt-templates/route.ts` - API for managing templates

**Features:**
- Handlebars-like template syntax with variables
- Support for conditional blocks (`{{#if}}`) and loops (`{{#each}}`)
- Template validation
- Default template included

**Template Variables:**
- `{{storeName}}`, `{{logo}}`, `{{address}}`, `{{phone}}`, `{{email}}`
- `{{receiptNumber}}`, `{{date}}`, `{{time}}`
- `{{items}}` (array with `name`, `quantity`, `price`, `subtotal`)
- `{{subtotal}}`, `{{discount}}`, `{{tax}}`, `{{total}}`
- `{{paymentMethod}}`, `{{cashReceived}}`, `{{change}}`
- `{{header}}`, `{{footer}}`

**API Endpoints:**
- `GET /api/tenants/{slug}/receipt-templates` - List all templates
- `POST /api/tenants/{slug}/receipt-templates` - Create new template
- `PUT /api/tenants/{slug}/receipt-templates` - Update template
- `DELETE /api/tenants/{slug}/receipt-templates?id={id}` - Delete template

### 3. Email/SMS Notification Templates

**Files Created:**
- `lib/notification-templates.ts` - Notification template engine
- `app/api/tenants/[slug]/notification-templates/route.ts` - API for managing templates

**Features:**
- Separate templates for email and SMS
- Variable substitution with date/time formatting
- Default templates for common notification types
- Support for conditional blocks

**Template Categories:**
- Booking: confirmation, reminder, cancellation
- Stock: low stock alerts
- Attendance: attendance alerts
- Transaction: transaction notifications

**Template Variables:**
- `{{customerName}}`, `{{serviceName}}`, `{{date}}`, `{{time}}`
- `{{staffName}}`, `{{notes}}`, `{{companyName}}`
- `{{productName}}`, `{{sku}}`, `{{currentStock}}`, `{{threshold}}`

**API Endpoints:**
- `GET /api/tenants/{slug}/notification-templates` - Get all templates
- `PUT /api/tenants/{slug}/notification-templates` - Update template

### 4. Advanced Branding

**Features:**
- Custom font support (Google Fonts, custom fonts, system fonts)
- Theme presets (light, dark, auto, custom)
- Custom CSS variables
- Border radius customization

**Settings Structure:**
```typescript
advancedBranding: {
  fontFamily: string;
  fontSource: 'google' | 'custom' | 'system';
  googleFontUrl?: string;
  customFontUrl?: string;
  theme: 'light' | 'dark' | 'auto' | 'custom';
  customTheme?: {
    css?: string;
    variables?: Record<string, string>;
  };
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  customBorderRadius?: string;
}
```

### 5. Regional Tax Rules

**Files Created:**
- `lib/tax-rules.ts` - Tax calculation engine
- `app/api/tenants/[slug]/tax-rules/route.ts` - API for managing tax rules

**Features:**
- Multiple tax rates based on:
  - Region (country, state, city, zip code)
  - Product type (products, services, all)
  - Category IDs
  - Product IDs
- Priority-based rule application
- Active/inactive rule status

**Tax Rule Structure:**
```typescript
{
  id: string;
  name: string;
  rate: number; // 0-100
  label: string;
  appliesTo: 'all' | 'products' | 'services' | 'categories';
  categoryIds?: string[];
  productIds?: string[];
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCodes?: string[];
  };
  priority: number;
  isActive: boolean;
}
```

**Usage:**
```typescript
import { calculateTax } from '@/lib/tax-rules';

const tax = calculateTax({
  productId: 'prod123',
  categoryId: 'cat456',
  productType: 'product',
  region: { country: 'US', state: 'CA', zipCode: '90210' },
  subtotal: 100,
}, taxRules, defaultTaxRate);
```

**API Endpoints:**
- `GET /api/tenants/{slug}/tax-rules` - List all tax rules
- `POST /api/tenants/{slug}/tax-rules` - Create new tax rule
- `PUT /api/tenants/{slug}/tax-rules` - Update tax rule
- `DELETE /api/tenants/{slug}/tax-rules?id={id}` - Delete tax rule

### 6. Business Hours Configuration

**Files Created:**
- `lib/business-hours.ts` - Business hours checking and management
- `app/api/tenants/[slug]/business-hours/route.ts` - API for managing hours

**Features:**
- Weekly schedule (Monday-Sunday)
- Special hours for specific dates
- Break times during business hours
- Timezone-aware hours
- Business open/closed checking

**Usage:**
```typescript
import { isBusinessOpen, getNextOpenTime } from '@/lib/business-hours';

const status = isBusinessOpen(new Date(), businessHours, holidays);
if (!status.isOpen) {
  console.log(`Closed: ${status.reason}`);
  console.log(`Next open: ${status.nextOpen}`);
}
```

**API Endpoints:**
- `GET /api/tenants/{slug}/business-hours` - Get business hours
- `PUT /api/tenants/{slug}/business-hours` - Update business hours

### 7. Holiday Calendars

**Files Created:**
- `app/api/tenants/[slug]/holidays/route.ts` - API for managing holidays
- Integrated with `lib/business-hours.ts`

**Features:**
- Single-date holidays
- Recurring holidays (yearly, monthly, weekly)
- Business closed flag
- Holiday checking in business hours

**Holiday Structure:**
```typescript
{
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: 'single' | 'recurring';
  recurring?: {
    pattern: 'yearly' | 'monthly' | 'weekly';
    dayOfMonth?: number;
    dayOfWeek?: number; // 0-6, Sunday = 0
    month?: number; // 1-12
  };
  isBusinessClosed: boolean;
}
```

**API Endpoints:**
- `GET /api/tenants/{slug}/holidays` - List all holidays
- `POST /api/tenants/{slug}/holidays` - Create new holiday
- `PUT /api/tenants/{slug}/holidays` - Update holiday
- `DELETE /api/tenants/{slug}/holidays?id={id}` - Delete holiday

## Database Schema Updates

The `Tenant` model has been extended with the following new settings:

```typescript
// Multi-Currency
multiCurrency?: {
  enabled: boolean;
  displayCurrencies?: string[];
  exchangeRates?: Record<string, number>;
  exchangeRateSource?: 'manual' | 'api';
  exchangeRateApiKey?: string;
  lastUpdated?: Date;
};

// Receipt Templates
receiptTemplates?: {
  default?: string;
  templates?: Array<ReceiptTemplate>;
};

// Notification Templates
notificationTemplates?: {
  email?: Record<string, string>;
  sms?: Record<string, string>;
};

// Advanced Branding
advancedBranding?: {
  fontFamily?: string;
  fontSource?: 'google' | 'custom' | 'system';
  googleFontUrl?: string;
  customFontUrl?: string;
  theme?: 'light' | 'dark' | 'auto' | 'custom';
  customTheme?: {
    css?: string;
    variables?: Record<string, string>;
  };
  borderRadius?: string;
  customBorderRadius?: string;
};

// Tax Rules
taxRules?: Array<TaxRule>;

// Business Hours
businessHours?: BusinessHours;

// Holidays
holidays?: Array<Holiday>;
```

## Integration Points

### Receipt Printing
The receipt printer service can be updated to use custom templates:
```typescript
import { renderReceiptTemplate, getDefaultTemplate } from '@/lib/receipt-templates';

const template = getTemplateById(templateId) || getDefaultTemplate();
const html = renderReceiptTemplate(template.html, receiptData);
```

### Notifications
The notification system now uses templates automatically:
```typescript
import { sendBookingConfirmation } from '@/lib/notifications';

// Templates are automatically used if configured
await sendBookingConfirmation(bookingData, tenantSettings);
```

### Tax Calculation
Tax calculation now supports multiple rules:
```typescript
import { calculateTax } from '@/lib/tax-rules';

const tax = calculateTax(context, tenantSettings.taxRules, tenantSettings.taxRate);
```

## Next Steps

To complete the implementation, the following UI components should be added to the settings page:

1. **Multi-Currency Settings UI**
   - Enable/disable multi-currency
   - Select display currencies
   - Configure exchange rate source
   - View/manage exchange rates

2. **Receipt Template Editor**
   - Template list and management
   - HTML editor with preview
   - Variable reference guide

3. **Notification Template Editor**
   - Template list by category
   - Editor for email and SMS templates
   - Variable reference guide

4. **Advanced Branding UI**
   - Font selector
   - Theme selector
   - CSS variable editor
   - Border radius settings

5. **Tax Rules Manager**
   - Rule list and CRUD operations
   - Rule priority management
   - Region/product/category selectors

6. **Business Hours Manager**
   - Weekly schedule editor
   - Special hours calendar
   - Break time management

7. **Holiday Calendar**
   - Holiday list
   - Add/edit holiday form
   - Recurring holiday configuration

## Testing

All API endpoints have been created and are ready for testing. The core functionality is implemented in the library files and can be tested independently.

## Notes

- All new features are backward compatible
- Default values are provided for all new settings
- Existing functionality remains unchanged
- Templates use a simple Handlebars-like syntax for easy customization
