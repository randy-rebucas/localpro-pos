# 4. Branding & Customization

## Basic Branding

Navigate to **Settings** to configure:

### Store Identity

| Setting | Location | Description |
|---------|----------|-------------|
| **Company Name** | Settings > General | Displayed on receipts, emails, and UI header |
| **Logo** | Settings > General | Upload PNG/JPG, displayed on receipts and navigation |
| **Favicon** | Settings > General | Browser tab icon (16x16 or 32x32 PNG) |

### Brand Colors

| Setting | Default | Usage |
|---------|---------|-------|
| **Primary Color** | `#2563eb` (Blue) | Buttons, links, active states |
| **Secondary Color** | — | Secondary buttons, badges |
| **Accent Color** | — | Highlights, notifications |
| **Background Color** | — | Page background |
| **Text Color** | — | Primary text |

Colors accept hex values (e.g., `#FF5733`) or CSS color names.

## Advanced Branding

Navigate to **Admin > Advanced Branding** for deeper customization.

### Typography

| Setting | Options | Description |
|---------|---------|-------------|
| **Font Family** | Any font name | Custom font for the UI |
| **Font Source** | `system` / `google` / `custom` | Where to load the font from |
| **Google Font URL** | Google Fonts URL | For Google Fonts integration |
| **Custom Font URL** | CDN URL | For self-hosted fonts |

**System fonts** (no external load):
- Default sans-serif stack
- Best performance, no external requests

**Google Fonts** example:
```
Font Family: "Inter"
Font Source: google
Google Font URL: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700
```

### Theme

| Theme | Description |
|-------|-------------|
| `light` | White background, dark text (default) |
| `dark` | Dark background, light text |
| `auto` | Follows device system preference |
| `custom` | Define your own via CSS |

### Custom CSS

For `custom` theme, you can inject CSS:

```css
/* Example: Custom theme */
:root {
  --primary: #FF5733;
  --background: #1a1a2e;
  --text: #eee;
}
```

Enter in the **Custom CSS** field or define individual **CSS Variables**.

### Border Radius

Controls the roundness of UI elements:

| Value | Effect |
|-------|--------|
| `none` | Square corners |
| `sm` | Slightly rounded |
| `md` | Moderately rounded (default) |
| `lg` | Noticeably rounded |
| `xl` | Very rounded |
| `custom` | Enter a custom value (e.g., `12px`) |

## Receipt Branding

Navigate to **Settings > Receipt Templates** for receipt-specific branding.

### Receipt Header

Custom text that appears at the top of every receipt:
```
MARIA'S BAKESHOP
Main Street, Makati City
TIN: 123-456-789-000
VAT Registered
```

### Receipt Footer

Custom text at the bottom:
```
Thank you for your purchase!
Exchange within 7 days with receipt.
This serves as your Official Receipt.
```

### Receipt Options

| Option | Default | Effect |
|--------|---------|--------|
| Show Logo | Yes | Print logo at top of receipt |
| Show Address | Yes | Print store address |
| Show Phone | No | Print phone number |
| Show Email | No | Print email address |

### Receipt Templates

Create multiple receipt templates for different purposes:
- **Default** — Standard sales receipt
- **Invoice** — Detailed invoice format
- **Gift Receipt** — No prices shown
- Each template uses HTML with template variables

Template variables available:
```
{{storeName}}, {{storeAddress}}, {{storeTIN}}
{{receiptNumber}}, {{date}}, {{time}}
{{items}}, {{subtotal}}, {{tax}}, {{total}}
{{customerName}}, {{paymentMethod}}
{{cashierName}}, {{branchName}}
```

## Email Branding

Email notifications use your branding:
- Logo appears in email header
- Primary color used for buttons and highlights
- Company name in sender display name
- Customize further via **Notification Templates**

## PWA Branding

The PWA manifest uses your branding:
- **App Name** — Your company name
- **Theme Color** — Your primary color
- **Icons** — Your logo in multiple sizes (auto-generated)
- **Background Color** — Your background color

Users who install the PWA see your branding on their home screen.

## Best Practices

1. **Use high-contrast colors** — Ensure text is readable against backgrounds
2. **Optimize logo size** — Keep under 200KB for fast loading
3. **Test on receipt** — Print a test receipt after changing branding
4. **Check mobile** — Verify branding looks good on small screens
5. **Keep it professional** — Consistent branding builds customer trust
