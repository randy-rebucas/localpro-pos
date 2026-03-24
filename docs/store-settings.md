# Store Settings — Complete Reference

All store settings are managed by Admin or Owner roles. Settings are stored in the tenant `settings` object and can be changed via the Admin UI or the API (`PUT /api/tenants/{slug}/settings`).

---

## Table of Contents

1. [General / Localization](#1-general--localization)
2. [Branding](#2-branding)
3. [Contact Information](#3-contact-information)
4. [Receipt & Invoice](#4-receipt--invoice)
5. [Business](#5-business)
6. [BIR Compliance](#6-bir-compliance)
7. [Notifications](#7-notifications)
8. [Feature Flags](#8-feature-flags)
9. [Hardware](#9-hardware)
10. [Multi-Currency](#10-multi-currency)
11. [Receipt Templates](#11-receipt-templates)
12. [Notification Templates](#12-notification-templates)
13. [Advanced Branding](#13-advanced-branding)
14. [Tax Rules](#14-tax-rules)
15. [Business Hours](#15-business-hours)
16. [Holidays](#16-holidays)
17. [How to Change Settings](#17-how-to-change-settings)

---

## 1. General / Localization

**UI path:** Settings → General tab

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `currency` | String | `USD` | ISO 4217 currency code (e.g. `PHP`, `USD`, `EUR`) |
| `currencySymbol` | String | — | Display symbol (e.g. `₱`, `$`, `€`) |
| `currencyPosition` | `before` / `after` | `before` | Symbol placement — `₱100` vs `100₱` |
| `dateFormat` | String | `MM/DD/YYYY` | Date display format |
| `timeFormat` | `12h` / `24h` | `12h` | Time display format |
| `timezone` | String | `UTC` | IANA timezone (e.g. `Asia/Manila`) |
| `language` | `en` / `es` | `en` | Interface language |
| `numberFormat.decimalSeparator` | String | `.` | Decimal separator (`.` or `,`) |
| `numberFormat.thousandsSeparator` | String | `,` | Thousands separator (`,` or `.`) |
| `numberFormat.decimalPlaces` | Number | `2` | Decimal places for currency display |

**Recommended Philippine settings:**
```
currency:          PHP
currencySymbol:    ₱
currencyPosition:  before
dateFormat:        MM/DD/YYYY
timeFormat:        12h
timezone:          Asia/Manila
language:          en
```

---

## 2. Branding

**UI path:** Settings → Branding tab

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `companyName` | String | — | Business name shown on receipts and UI |
| `logo` | String (URL) | — | Store logo image URL |
| `favicon` | String (URL) | — | Browser tab icon URL |
| `primaryColor` | Hex | `#2563eb` | Primary brand color |
| `secondaryColor` | Hex | — | Secondary brand color |
| `accentColor` | Hex | — | Accent/highlight color |
| `backgroundColor` | Hex | — | Page background color |
| `textColor` | Hex | — | Primary text color |

> For font, theme, and custom CSS — see [Advanced Branding](#13-advanced-branding).

---

## 3. Contact Information

**UI path:** Settings → Contact tab

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | Store contact email |
| `phone` | String | Store contact phone number |
| `address.street` | String | Street address |
| `address.city` | String | City |
| `address.state` | String | State / Province |
| `address.zipCode` | String | ZIP / Postal code |
| `address.country` | String | Country |
| `website` | String | Store website URL |

---

## 4. Receipt & Invoice

**UI path:** Settings → Receipt tab

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `receiptHeader` | String | — | Custom text printed at the top of receipts |
| `receiptFooter` | String | — | Custom text printed at the bottom of receipts |
| `receiptShowLogo` | Boolean | `true` | Print store logo on receipts |
| `receiptShowAddress` | Boolean | `true` | Print store address on receipts |
| `receiptShowPhone` | Boolean | `false` | Print phone number on receipts |
| `receiptShowEmail` | Boolean | `false` | Print email on receipts |
| `taxEnabled` | Boolean | `false` | Enable tax calculations on transactions |
| `taxRate` | Number | `0` | Default tax rate (0–100) |
| `taxLabel` | String | `Tax` | Tax label shown on receipts (e.g. `VAT`, `GST`) |

> For custom receipt HTML templates — see [Receipt Templates](#11-receipt-templates).

---

## 5. Business

**UI path:** Settings → Business tab

| Field | Type | Description |
|-------|------|-------------|
| `businessType` | String | Industry type: `Retail`, `Restaurant`, `Salon`, `Service`, `Grocery`, `Pharmacy`, `Café`, etc. |
| `taxId` | String | Generic Tax Identification Number |
| `registrationNumber` | String | Business / SEC registration number |

---

## 6. BIR Compliance

**UI path:** Admin → BIR Compliance

Philippines-specific Bureau of Internal Revenue (BIR) fields. Access and features are gated by subscription plan.

| Field | Type | Plan Required | Description |
|-------|------|---------------|-------------|
| `birTin` | String | Pro+ | BIR Tax Identification Number — format `NNN-NNN-NNN-NNN` |
| `birPtuNumber` | String | Pro+ | Permit to Use (PTU) number issued by BIR (e.g. `POS-0001-2024`) |
| `birPtuIssuedDate` | Date | Pro+ | Date the PTU was issued |
| `birPtuExpiryDate` | Date | Pro+ | PTU expiry date — system warns 30 days before |

**BIR features by plan:**

| Feature | Starter | Pro | Business | Enterprise |
|---------|:-------:|:---:|:--------:|:----------:|
| Audit Trail | ✅ | ✅ | ✅ | ✅ |
| Receipt Formatting | ❌ | ✅ | ✅ | ✅ |
| PTU Assistance | ❌ | ✅ | ✅ | ✅ |
| CAS Reporting | ❌ | ❌ | ✅ | ✅ |
| Monthly Support | ❌ | ❌ | ✅ | ✅ |

**CAS export:** Available to Business/Enterprise tenants at `GET /api/reports/cas?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Returns CSV with columns: `date, receiptNumber, description, debit, credit, vatableSales, vatAmount, vatExemptSales, total`.

---

## 7. Notifications

**UI path:** Settings → Notifications tab

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `lowStockThreshold` | Number | `10` | Quantity that triggers a low stock alert |
| `lowStockAlert` | Boolean | `true` | Enable low stock email/in-app alerts |
| `emailNotifications` | Boolean | `false` | Enable email notifications globally |
| `smsNotifications` | Boolean | `false` | Enable SMS notifications globally |
| `attendanceNotifications.enabled` | Boolean | `true` | Enable attendance alert emails |
| `attendanceNotifications.expectedStartTime` | String | `09:00` | Expected clock-in time (HH:MM, 24h) |
| `attendanceNotifications.maxHoursWithoutClockOut` | Number | `12` | Hours before triggering a missed clock-out alert |

---

## 8. Feature Flags

**UI path:** Admin → Feature Flags

Controls which modules are active for this tenant. Each flag must also be enabled in the subscription plan.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `enableInventory` | Boolean | `true` | Stock tracking and inventory module |
| `enableCategories` | Boolean | `true` | Product category grouping |
| `enableDiscounts` | Boolean | `false` | Discount codes and promotions |
| `enableLoyaltyProgram` | Boolean | `false` | Loyalty points and rewards |
| `enableCustomerManagement` | Boolean | `false` | Customer database and history |
| `enableBookingScheduling` | Boolean | `false` | Bookings and appointment calendar |

> **Two-layer check:** a feature must be ON in settings AND included in the subscription plan. If either is off, the feature is hidden.

---

## 9. Hardware

**UI path:** Admin → Hardware

| Device | Field | Type | Options / Description |
|--------|-------|------|-----------------------|
| Receipt Printer | `hardwareConfig.printer.type` | String | `browser`, `usb`, `serial`, `network` |
| | `hardwareConfig.printer.ipAddress` | String | IP address for network printer |
| | `hardwareConfig.printer.portNumber` | Number | Port for network printer |
| Barcode Scanner | `hardwareConfig.barcodeScanner.type` | String | `keyboard`, `camera`, `usb` |
| | `hardwareConfig.barcodeScanner.enabled` | Boolean | Enable barcode scanning |
| QR Reader | `hardwareConfig.qrReader.enabled` | Boolean | Enable QR code reader |
| | `hardwareConfig.qrReader.cameraId` | String | Camera device ID for QR scanning |
| Cash Drawer | `hardwareConfig.cashDrawer.enabled` | Boolean | Enable cash drawer |
| | `hardwareConfig.cashDrawer.connectedToPrinter` | Boolean | Open drawer via printer kick command |
| Touchscreen | `hardwareConfig.touchscreen.enabled` | Boolean | Optimize UI for touchscreen input |

---

## 10. Multi-Currency

**UI path:** Admin → Multi-Currency

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `multiCurrency.enabled` | Boolean | `false` | Enable multi-currency display |
| `multiCurrency.displayCurrencies` | String[] | — | List of currency codes to show (e.g. `["USD","EUR"]`) |
| `multiCurrency.exchangeRates` | Map | — | Exchange rates from base currency (e.g. `{"USD": 56.5}`) |
| `multiCurrency.exchangeRateSource` | `manual` / `api` | `manual` | Whether rates are set manually or via API |
| `multiCurrency.exchangeRateApiKey` | String | — | API key for automatic rate updates |
| `multiCurrency.lastUpdated` | Date | — | Timestamp of last exchange rate refresh |

---

## 11. Receipt Templates

**UI path:** Admin → Hardware (receipt template section)
**API:** `GET/POST /api/tenants/{slug}/receipt-templates`
**Plan required:** Pro+ (`birCompliance.receiptFormatting`)

| Field | Type | Description |
|-------|------|-------------|
| `receiptTemplates.default` | String | ID of the active default template |
| `receiptTemplates.templates[].id` | String | Unique template ID |
| `receiptTemplates.templates[].name` | String | Template display name |
| `receiptTemplates.templates[].html` | String | Handlebars-style HTML template |
| `receiptTemplates.templates[].isDefault` | Boolean | Whether this is the active template |

**Available template variables:** `{{storeName}}`, `{{address}}`, `{{phone}}`, `{{receiptNumber}}`, `{{date}}`, `{{items}}`, `{{subtotal}}`, `{{taxAmount}}`, `{{total}}`, `{{paymentMethod}}`, `{{change}}`

---

## 12. Notification Templates

**UI path:** Admin → Notification Templates

| Channel | Template Key | Description |
|---------|-------------|-------------|
| Email | `notificationTemplates.email.bookingConfirmation` | Sent when a booking is created |
| Email | `notificationTemplates.email.bookingReminder` | Sent 24 hours before a booking |
| Email | `notificationTemplates.email.bookingCancellation` | Sent when a booking is cancelled |
| Email | `notificationTemplates.email.lowStockAlert` | Sent when stock drops below threshold |
| Email | `notificationTemplates.email.attendanceAlert` | Sent for missed clock-in/out |
| SMS | `notificationTemplates.sms.bookingConfirmation` | SMS booking confirmation |
| SMS | `notificationTemplates.sms.bookingReminder` | SMS 24h reminder |
| SMS | `notificationTemplates.sms.bookingCancellation` | SMS cancellation notice |
| SMS | `notificationTemplates.sms.lowStockAlert` | SMS stock alert |

**Common template variables:** `{{customerName}}`, `{{bookingDate}}`, `{{bookingTime}}`, `{{storeName}}`, `{{totalAmount}}`, `{{productName}}`, `{{currentStock}}`

---

## 13. Advanced Branding

**UI path:** Admin → Advanced Branding

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `advancedBranding.fontFamily` | String | — | Font family name |
| `advancedBranding.fontSource` | `google` / `custom` / `system` | `system` | Where to load the font from |
| `advancedBranding.googleFontUrl` | String | — | Full Google Fonts embed URL |
| `advancedBranding.customFontUrl` | String | — | URL to a custom font file |
| `advancedBranding.theme` | `light` / `dark` / `auto` / `custom` | `light` | UI color theme |
| `advancedBranding.customTheme.css` | String | — | Raw CSS overrides applied globally |
| `advancedBranding.customTheme.variables` | Map | — | CSS custom property overrides |
| `advancedBranding.borderRadius` | `none` / `sm` / `md` / `lg` / `xl` / `custom` | `md` | Corner rounding for UI elements |
| `advancedBranding.customBorderRadius` | String | — | Custom value when `borderRadius` is `custom` (e.g. `8px`) |

---

## 14. Tax Rules

**UI path:** Admin → Tax Rules
**API:** `GET/POST/PUT/DELETE /api/tenants/{slug}/tax-rules`

Each rule in the `taxRules[]` array:

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Auto-generated unique ID |
| `name` | String | Rule name (e.g. "Standard VAT") |
| `rate` | Number | Tax percentage (0–100) |
| `label` | String | Label shown on receipts (e.g. "VAT 12%") |
| `appliesTo` | `all` / `products` / `services` / `categories` | Scope of the rule |
| `categoryIds` | String[] | Category IDs if `appliesTo` is `categories` |
| `productIds` | String[] | Product IDs for product-specific rules |
| `region.country` | String | Limit rule to a country |
| `region.state` | String | Limit rule to a state/province |
| `region.city` | String | Limit rule to a city |
| `region.zipCodes` | String[] | Limit rule to specific ZIP codes |
| `priority` | Number | Higher number = applied first when multiple rules match |
| `isActive` | Boolean | Whether the rule is currently enforced |

**Standard Philippine tax types:**

| Name | Rate | Use |
|------|------|-----|
| Standard VAT | 12% | Most goods and services |
| VAT-Exempt | 0% | Senior/PWD discounts, exempt goods |
| Zero-Rated | 0% | Exported goods and services |

---

## 15. Business Hours

**UI path:** Admin → Business Hours

Stored in `businessHours` on the tenant settings:

| Field | Type | Description |
|-------|------|-------------|
| `businessHours.timezone` | String | Timezone for business hours (IANA) |
| `businessHours.schedule.{day}.enabled` | Boolean | Whether the store is open on this day |
| `businessHours.schedule.{day}.openTime` | String | Opening time (HH:MM, 24h) |
| `businessHours.schedule.{day}.closeTime` | String | Closing time (HH:MM, 24h) |
| `businessHours.schedule.{day}.breaks[].start` | String | Break start time (HH:MM) |
| `businessHours.schedule.{day}.breaks[].end` | String | Break end time (HH:MM) |
| `businessHours.specialHours[].date` | String | Date override (YYYY-MM-DD) |
| `businessHours.specialHours[].enabled` | Boolean | Open or closed on this date |
| `businessHours.specialHours[].openTime` | String | Override open time |
| `businessHours.specialHours[].closeTime` | String | Override close time |
| `businessHours.specialHours[].note` | String | Reason/note for the override |

Days: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`

Business hours affect: booking availability, auto clock-out, cash drawer auto-close, report date boundaries.

---

## 16. Holidays

**UI path:** Admin → Holidays

Each entry in the `holidays[]` array:

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Auto-generated unique ID |
| `name` | String | Holiday name (e.g. "New Year's Day") |
| `date` | String | Date in `YYYY-MM-DD` format |
| `type` | `single` / `recurring` | One-time or repeating holiday |
| `recurring.pattern` | `yearly` / `monthly` / `weekly` | Repeat frequency |
| `recurring.dayOfMonth` | Number | Day of month (for monthly) |
| `recurring.dayOfWeek` | Number | Day of week 0–6 (for weekly) |
| `recurring.month` | Number | Month 1–12 (for yearly) |
| `isBusinessClosed` | Boolean | Mark as closed day for bookings |

---

## 17. How to Change Settings

### Via Admin UI

1. Log in as **Admin** or **Owner**
2. Go to **Settings** (general tabs) or **Admin** (specialized sections)
3. Update the desired fields
4. Click **Save**

### Via API

```
PUT /api/tenants/{slug}/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "currency": "PHP",
  "taxEnabled": true,
  "taxRate": 12,
  "taxLabel": "VAT"
}
```

Settings use a **three-way merge**: defaults → existing tenant settings → incoming body. Only send the fields you want to change. Sub-sections managed by dedicated admin pages (`taxRules`, `businessHours`, `holidays`, `receiptTemplates`, `notificationTemplates`, `advancedBranding`, `hardwareConfig`, BIR fields) are always preserved even if omitted from the request body.

**Dedicated API endpoints** (do not go through `/settings`):

| Section | Endpoint |
|---------|----------|
| Tax Rules | `GET/POST/PUT/DELETE /api/tenants/{slug}/tax-rules` |
| Business Hours | `GET/PUT /api/tenants/{slug}/business-hours` |
| Holidays | `GET/POST/PUT/DELETE /api/tenants/{slug}/holidays` |
| Receipt Templates | `GET/POST/PUT/DELETE /api/tenants/{slug}/receipt-templates` |
| Notification Templates | `GET/PUT /api/tenants/{slug}/notification-templates` |
| BIR Settings | `GET/PUT /api/tenants/{slug}/bir-settings` |
| Exchange Rates | `GET/PUT /api/tenants/{slug}/exchange-rates` |

### Access Levels

| Role | Can Read | Can Write |
|------|----------|-----------|
| Cashier | ✅ (public settings) | ❌ |
| Manager | ✅ | ✅ (most settings) |
| Admin | ✅ | ✅ |
| Owner | ✅ | ✅ |
| Super Admin | ✅ | ✅ (all tenants) |
