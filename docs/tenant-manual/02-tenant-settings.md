# 2. Tenant Settings Reference

All tenant settings are stored in the `settings` object of the tenant record. This is the complete reference.

## Currency & Localization

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `currency` | String | `USD` | ISO 4217 currency code (e.g., `PHP`, `USD`, `EUR`) |
| `currencySymbol` | String | — | Display symbol (e.g., `₱`, `$`, `€`) |
| `currencyPosition` | `before` / `after` | `before` | Symbol placement: `$100` vs `100$` |
| `dateFormat` | String | `MM/DD/YYYY` | Date display format |
| `timeFormat` | `12h` / `24h` | `12h` | Time display format |
| `timezone` | String | `UTC` | IANA timezone (e.g., `Asia/Manila`) |
| `language` | `en` / `es` | `en` | Interface language |
| `numberFormat.decimalSeparator` | String | `.` | Decimal separator (`.` or `,`) |
| `numberFormat.thousandsSeparator` | String | `,` | Thousands separator (`,` or `.`) |
| `numberFormat.decimalPlaces` | Number | `2` | Decimal places for currency display |

### Recommended Philippine Settings

```
currency: "PHP"
currencySymbol: "₱"
currencyPosition: "before"
dateFormat: "MM/DD/YYYY"
timeFormat: "12h"
timezone: "Asia/Manila"
language: "en"
```

## Branding

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `companyName` | String | — | Business name displayed on receipts/UI |
| `logo` | String (URL) | — | Store logo image URL |
| `favicon` | String (URL) | — | Browser favicon URL |
| `primaryColor` | Hex | `#2563eb` | Primary brand color |
| `secondaryColor` | Hex | — | Secondary brand color |
| `accentColor` | Hex | — | Accent/highlight color |
| `backgroundColor` | Hex | — | Background color |
| `textColor` | Hex | — | Primary text color |

## Contact Information

| Setting | Type | Description |
|---------|------|-------------|
| `email` | String | Store contact email |
| `phone` | String | Store contact phone |
| `address.street` | String | Street address |
| `address.city` | String | City |
| `address.state` | String | State/Province |
| `address.zipCode` | String | ZIP/Postal code |
| `address.country` | String | Country |
| `website` | String | Store website URL |

## Receipt & Invoice Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `receiptHeader` | String | — | Custom text at top of receipts |
| `receiptFooter` | String | — | Custom text at bottom of receipts |
| `receiptShowLogo` | Boolean | `true` | Show logo on receipts |
| `receiptShowAddress` | Boolean | `true` | Show address on receipts |
| `receiptShowPhone` | Boolean | `false` | Show phone on receipts |
| `receiptShowEmail` | Boolean | `false` | Show email on receipts |
| `taxEnabled` | Boolean | `false` | Enable tax calculations |
| `taxRate` | Number | `0` | Default tax rate (0-100) |
| `taxLabel` | String | `Tax` | Tax label on receipts (e.g., "VAT", "GST") |

## Business Settings

| Setting | Type | Description |
|---------|------|-------------|
| `businessType` | String | Industry type: `Retail`, `Restaurant`, `Salon`, `Service`, etc. |
| `taxId` | String | Tax Identification Number (TIN) |
| `registrationNumber` | String | Business registration number |

## Notification Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `lowStockThreshold` | Number | `10` | Global low stock alert threshold |
| `lowStockAlert` | Boolean | `true` | Enable low stock alerts |
| `emailNotifications` | Boolean | `false` | Enable email notifications |
| `smsNotifications` | Boolean | `false` | Enable SMS notifications |
| `attendanceNotifications.enabled` | Boolean | `true` | Enable attendance alerts |
| `attendanceNotifications.expectedStartTime` | String | `09:00` | Expected clock-in time (HH:MM) |
| `attendanceNotifications.maxHoursWithoutClockOut` | Number | `12` | Hours before auto clock-out (1-24) |

## Feature Flags

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enableInventory` | Boolean | `true` | Enable inventory tracking module |
| `enableCategories` | Boolean | `true` | Enable product categories |
| `enableDiscounts` | Boolean | `false` | Enable discount/promo codes |
| `enableLoyaltyProgram` | Boolean | `false` | Enable loyalty points |
| `enableCustomerManagement` | Boolean | `false` | Enable customer database, **Admin > Customers**, and POS customer attach/search (when plan allows) |
| `enableBookingScheduling` | Boolean | `false` | Enable bookings/appointments |
| `enableTableManagement` | Boolean | `false` | Enable floor/table map and related restaurant flows where implemented |
| `enableOnAccountSales` | Boolean | `false` | Allow **On account** payment on the POS when a customer is attached; tracks **balance due** and balance payment recording |

> **Note:** Feature flags are also governed by the subscription plan. A feature must be both enabled in settings AND included in the plan. **On-account sales** depends on **Customer Management** being meaningful in your workflow (customer must be selected for on-account checkout).

See also [Feature Flags](./10-feature-flags.md) for operational detail and [User Manual: Customers](../user-manual/08-customers.md) for end-user procedures.

## Hardware Configuration

| Setting | Path | Type | Description |
|---------|------|------|-------------|
| Printer type | `hardwareConfig.printer.type` | `browser` / `usb` / `serial` / `network` | Receipt printer connection |
| Printer IP | `hardwareConfig.printer.ipAddress` | String | Network printer IP address |
| Printer port | `hardwareConfig.printer.portNumber` | Number | Network printer port |
| Scanner type | `hardwareConfig.barcodeScanner.type` | `keyboard` / `camera` / `usb` | Barcode scanner input mode |
| Scanner enabled | `hardwareConfig.barcodeScanner.enabled` | Boolean | Enable barcode scanning |
| QR enabled | `hardwareConfig.qrReader.enabled` | Boolean | Enable QR code reading |
| QR camera | `hardwareConfig.qrReader.cameraId` | String | Specific camera for QR reading |
| Cash drawer | `hardwareConfig.cashDrawer.enabled` | Boolean | Enable cash drawer |
| Drawer via printer | `hardwareConfig.cashDrawer.connectedToPrinter` | Boolean | Open drawer via printer command |
| Touchscreen | `hardwareConfig.touchscreen.enabled` | Boolean | Optimize for touchscreen |

## Multi-Currency

| Setting | Path | Type | Default | Description |
|---------|------|------|---------|-------------|
| Enabled | `multiCurrency.enabled` | Boolean | `false` | Enable multi-currency |
| Display currencies | `multiCurrency.displayCurrencies` | String[] | — | Currency codes to show |
| Exchange rates | `multiCurrency.exchangeRates` | Map | — | Rates from base currency |
| Rate source | `multiCurrency.exchangeRateSource` | `manual` / `api` | `manual` | How rates update |
| API key | `multiCurrency.exchangeRateApiKey` | String | — | Exchange rate API key |
| Last updated | `multiCurrency.lastUpdated` | Date | — | Last rate refresh |

## Advanced Branding

| Setting | Path | Type | Default | Description |
|---------|------|------|---------|-------------|
| Font | `advancedBranding.fontFamily` | String | — | Custom font family |
| Font source | `advancedBranding.fontSource` | `google` / `custom` / `system` | `system` | Font loading source |
| Google font URL | `advancedBranding.googleFontUrl` | String | — | Google Fonts URL |
| Theme | `advancedBranding.theme` | `light` / `dark` / `auto` / `custom` | `light` | UI theme |
| Custom CSS | `advancedBranding.customTheme.css` | String | — | Custom CSS overrides |
| CSS variables | `advancedBranding.customTheme.variables` | Map | — | CSS custom properties |
| Border radius | `advancedBranding.borderRadius` | `none` / `sm` / `md` / `lg` / `xl` / `custom` | `md` | UI corner rounding |

## How to Change Settings

### Via Admin UI

1. Log in as Admin or Owner
2. Navigate to **Settings**
3. Modify the desired settings
4. Click **Save**

### Via API

```
PUT /api/tenants/{tenantId}
Content-Type: application/json

{
  "settings": {
    "currency": "PHP",
    "taxEnabled": true,
    "taxRate": 12,
    "taxLabel": "VAT"
  }
}
```

Settings are merged — you only need to send the fields you want to change.
