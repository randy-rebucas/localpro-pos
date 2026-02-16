# Tenant Settings & Branding

This document describes the comprehensive tenant-based settings and branding system implemented in the POS system.

## Overview

Each tenant (store/organization) can customize their POS system with extensive settings covering:
- Currency & Localization
- Branding (colors, logo, company info)
- Contact Information
- Receipt & Invoice Settings
- Tax Configuration
- Business Information
- Notification Preferences
- Feature Flags

## Settings Categories

### 1. Currency & Localization

**Currency Settings:**
- `currency`: Currency code (e.g., "USD", "EUR", "GBP")
- `currencySymbol`: Custom currency symbol (optional, auto-detected if not provided)
- `currencyPosition`: Position of currency symbol ("before" or "after")
  - Before: `$100.00`
  - After: `100.00$`

**Number Formatting:**
- `numberFormat.decimalSeparator`: Decimal separator (`.` or `,`)
- `numberFormat.thousandsSeparator`: Thousands separator (`,` or `.`)
- `numberFormat.decimalPlaces`: Number of decimal places (default: 2)

**Date & Time:**
- `dateFormat`: Date format ("MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD")
- `timeFormat`: Time format ("12h" or "24h")
- `timezone`: Timezone (e.g., "America/New_York", "Europe/London")

**Language:**
- `language`: Default language ("en" or "es")

### 2. Branding

**Visual Branding:**
- `companyName`: Company/store name
- `logo`: Logo URL (for display in UI and receipts)
- `favicon`: Favicon URL
- `primaryColor`: Primary brand color (hex format, e.g., "#2563eb")
- `secondaryColor`: Secondary brand color
- `accentColor`: Accent color for highlights
- `backgroundColor`: Background color
- `textColor`: Primary text color

### 3. Contact Information

**Contact Details:**
- `email`: Business email address
- `phone`: Business phone number
- `website`: Business website URL

**Address:**
- `address.street`: Street address
- `address.city`: City
- `address.state`: State/Province
- `address.zipCode`: ZIP/Postal code
- `address.country`: Country

### 4. Receipt & Invoice Settings

**Receipt Display Options:**
- `receiptShowLogo`: Show logo on receipts (boolean)
- `receiptShowAddress`: Show address on receipts (boolean)
- `receiptShowPhone`: Show phone on receipts (boolean)
- `receiptShowEmail`: Show email on receipts (boolean)

**Receipt Content:**
- `receiptHeader`: Custom header text for receipts
- `receiptFooter`: Custom footer text for receipts

### 5. Tax Configuration

**Tax Settings:**
- `taxEnabled`: Enable tax calculation (boolean)
- `taxRate`: Tax rate percentage (0-100)
- `taxLabel`: Tax label (e.g., "VAT", "GST", "Sales Tax")

### 6. Business Information

**Business Details:**
- `businessType`: Type of business (e.g., "Retail", "Restaurant", "Service")
- `taxId`: Tax ID or EIN
- `registrationNumber`: Business registration number

### 7. Notification Settings

**Stock Alerts:**
- `lowStockThreshold`: Minimum stock level to trigger alert (default: 10)
- `lowStockAlert`: Enable low stock alerts (boolean)

**Notification Channels:**
- `emailNotifications`: Enable email notifications (boolean)
- `smsNotifications`: Enable SMS notifications (boolean)

### 8. Feature Flags

Control which features are enabled for the tenant:
- `enableInventory`: Enable inventory management
- `enableCategories`: Enable product categories
- `enableDiscounts`: Enable discount system
- `enableLoyaltyProgram`: Enable loyalty program
- `enableCustomerManagement`: Enable customer management

## API Endpoints

### Get Tenant Settings

```http
GET /api/tenants/{slug}/settings
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currency": "USD",
    "currencyPosition": "before",
    "primaryColor": "#2563eb",
    ...
  }
}
```

### Update Tenant Settings

```http
PUT /api/tenants/{slug}/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "settings": {
    "currency": "EUR",
    "primaryColor": "#10b981",
    "companyName": "My Store",
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currency": "EUR",
    "primaryColor": "#10b981",
    ...
  }
}
```

**Permissions:** Requires `admin` or `manager` role.

## Usage in Application

### Currency Formatting

Use the `formatCurrency` utility to format amounts based on tenant settings:

```typescript
import { formatCurrency } from '@/lib/currency';
import { getTenantBySlug } from '@/lib/tenant';

const tenant = await getTenantBySlug('default');
const formatted = formatCurrency(100.50, tenant.settings);
// Returns: "$100.50" or "100.50$" depending on currencyPosition
```

### Number Formatting

```typescript
import { formatNumber } from '@/lib/currency';

const formatted = formatNumber(1234.56, tenant.settings.numberFormat);
// Returns: "1,234.56" or "1.234,56" depending on settings
```

### Accessing Settings

Settings are automatically available in:
- Server components via `getTenantBySlug()`
- Client components via API calls to `/api/tenants/{slug}/settings`
- Layout components for applying branding (colors, logo)

## Settings Page

Access the settings page at:
```
/{tenant}/{lang}/settings
```

The settings page provides a comprehensive UI for managing all tenant settings, organized into sections:
- Currency & Localization
- Branding
- Contact Information
- Tax Settings

## Default Settings

When a new tenant is created, default settings are applied:

```typescript
{
  currency: 'USD',
  currencyPosition: 'before',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  timezone: 'UTC',
  language: 'en',
  numberFormat: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    decimalPlaces: 2,
  },
  primaryColor: '#2563eb',
  receiptShowLogo: true,
  receiptShowAddress: true,
  taxEnabled: false,
  lowStockThreshold: 10,
  lowStockAlert: true,
  enableInventory: true,
  enableCategories: true,
  ...
}
```

## Supported Currencies

The system includes built-in support for currency symbols for major currencies:
- USD ($), EUR (€), GBP (£), JPY (¥)
- CAD (C$), AUD (A$), CHF (CHF)
- CNY (¥), INR (₹), MXN (Mex$)
- And many more...

If a currency symbol is not found, the currency code is used as the symbol.

## Validation

Settings are validated when updated:
- Currency code must be 3 characters
- Tax rate must be between 0 and 100
- Colors must be in hex format (#RRGGBB or #RGB)
- Email addresses are validated
- All required fields are checked

## Best Practices

1. **Set Currency First**: Configure currency and number format before adding products
2. **Brand Colors**: Use consistent brand colors across primary, secondary, and accent
3. **Receipt Settings**: Configure receipt display options before processing transactions
4. **Tax Configuration**: Set up tax settings if applicable to your business
5. **Contact Info**: Complete contact information for professional receipts
6. **Feature Flags**: Enable only the features you need to keep the UI clean

## Migration Notes

Existing tenants will have their old settings structure automatically migrated when they access the settings page. The system merges old settings with new defaults.

## Future Enhancements

Potential additions:
- Multi-currency support (display prices in multiple currencies)
- Custom receipt templates
- Email/SMS notification templates
- Advanced branding (custom fonts, themes)
- Regional tax rules
- Business hours configuration
- Holiday calendars

