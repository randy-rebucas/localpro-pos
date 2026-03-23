# 1. Tenant Setup & Onboarding

## What Is a Tenant?

A tenant is an isolated store instance on the 1POS platform. Each tenant has its own:
- Database (logically isolated within MongoDB)
- Users and roles
- Products, inventory, and transactions
- Settings, branding, and configuration
- Subscription plan

Tenants are completely isolated — one tenant's data is never visible to another.

## Creating a New Tenant

### Via Signup Page

1. Navigate to the 1POS signup page
2. Fill in the registration form:

| Field | Required | Description |
|-------|----------|-------------|
| **Store Name** | Yes | Your business name (e.g., "Maria's Bakeshop") |
| **Slug** | Yes | URL-friendly identifier (e.g., `marias-bakeshop`) |
| **Owner Email** | Yes | Email for the Owner account |
| **Owner Password** | Yes | Secure password for the Owner |
| **Owner Name** | Yes | Full name of the business owner |

3. Click **Create Store**
4. The system creates:
   - A new tenant record
   - An Owner user account
   - Default settings (currency, timezone, etc.)
   - A trial subscription

### Via Admin Panel (Platform Owner)

1. Navigate to **Admin > Tenants**
2. Click **Add Tenant**
3. Fill in tenant details (name, slug, domain/subdomain)
4. Click **Save**
5. Create the Owner user separately via **Admin > Users**

## Tenant Identifiers

Each tenant has three potential identifiers:

| Identifier | Example | Purpose |
|-----------|---------|---------|
| **Slug** | `marias-bakeshop` | Path-based routing: `1pos.app/marias-bakeshop/en/pos` |
| **Subdomain** | `marias-bakeshop` | Subdomain routing: `marias-bakeshop.1pos.app` |
| **Custom Domain** | `pos.mariasbakeshop.com` | Custom domain mapping |

### Slug Rules

- Lowercase letters, numbers, and hyphens only
- Must be unique across the platform
- Cannot be changed after creation (contact support)
- Pattern: `^[a-z0-9-]+$`

## Accessing Your Tenant

After creation, access your store at:

```
https://1pos.app/{your-slug}/en/
```

Or if subdomain is configured:

```
https://{your-slug}.1pos.app/en/
```

The `/en/` part is the language code (English). Change to `/es/` for Spanish.

## Initial Configuration Checklist

After creating your tenant, complete these steps:

### Step 1: Business Information
- [ ] Set store name and company name
- [ ] Enter business address
- [ ] Add contact email and phone
- [ ] Set TIN (Tax Identification Number)
- [ ] Select business type

### Step 2: Currency & Localization
- [ ] Set primary currency (PHP for Philippines)
- [ ] Configure date format
- [ ] Set timezone (Asia/Manila for Philippines)
- [ ] Choose language

### Step 3: Tax Configuration
- [ ] Enable VAT (12% for Philippines)
- [ ] Set tax label ("VAT")
- [ ] Configure tax rules if needed

### Step 4: Receipt Setup
- [ ] Customize receipt header
- [ ] Add receipt footer (return policy, thank you message)
- [ ] Toggle logo, address, phone on receipts
- [ ] Preview and test receipt format

### Step 5: User Accounts
- [ ] Create Manager accounts
- [ ] Create Cashier accounts
- [ ] Set up PINs or QR codes for quick login

### Step 6: Products
- [ ] Create product categories
- [ ] Add products with prices, SKUs, and stock
- [ ] Set low stock thresholds

### Step 7: Hardware (if applicable)
- [ ] Configure receipt printer
- [ ] Set up barcode scanner
- [ ] Configure cash drawer

### Step 8: Test
- [ ] Process a test sale
- [ ] Print a test receipt
- [ ] Verify receipt has correct business info and tax breakdown
- [ ] Void the test transaction

## Trial Period

New tenants start with a trial subscription:
- **Duration:** Configured by platform (typically 14 or 30 days)
- **Features:** Full access to all features during trial
- **Limits:** No transaction or user limits during trial
- **After Trial:** Must upgrade to a paid plan to continue

## Tenant Lifecycle

```
Created → Trial → Active (Paid) → Renewed/Upgraded
                                 → Suspended (Payment Failed)
                                 → Cancelled
```

| Status | Meaning |
|--------|---------|
| **Trial** | Free trial period, full access |
| **Active** | Paid subscription, normal operation |
| **Suspended** | Payment failed, limited access (read-only) |
| **Cancelled** | Subscription ended, data retained for retention period |
| **Inactive** | Tenant deactivated by platform admin |
