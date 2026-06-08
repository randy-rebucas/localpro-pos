# 8. Customers

**Available to:** Manager, Admin, Owner (requires **Customer Management** in Settings and an eligible subscription, when enforced)

## Opening Customer Management

1. Navigate to **Admin > Customers**
2. Use **Upload Files** if your organization imports customer-related files through the admin file-upload workflow (optional).

## Customer list

The table shows:

| Column | Description |
|--------|-------------|
| **Name** | First and last name |
| **Email** | Contact email (optional) |
| **Phone** | Contact phone (optional) |
| **Total spent** | Running total from linked sales |
| **Balance due** | Amount owed on account (see *On-account sales* below) |
| **Tags** | Up to three tags shown; `+N` if there are more |
| **Status** | Active or inactive — click the badge to toggle |
| **Actions** | Edit, **Record payment** (when applicable), or **Delete** (deactivate) |

### Search and filters

- **Search** — Filters the list by first name, last name, email, or phone (debounced as you type).
- **Status filter** — **All**, **Active**, or **Inactive** inactive customers are hidden from default flows but kept for history.

There is no separate “sort by column” control in this screen; results are ordered by **newest created first** (paginated, 20 per page).

## Add or edit a customer

1. Click **Add Customer** or **Edit** on a row.
2. In the modal, complete the fields:

| Field | Required | Description |
|-------|----------|-------------|
| **First name** | Yes | Given name |
| **Last name** | Yes | Family name |
| **Email** | No | Used for receipts and notifications when provided |
| **Phone** | No | Contact number |
| **Tags** | No | Comma-separated labels (e.g. `VIP, Regular`) |
| **Notes** | No | Internal notes only |

3. Click **Save**.

> **Note:** Physical addresses are supported in the data model and API; the current admin modal focuses on name, contact, tags, and notes. Multi-address editing may be available through other tools or future UI.

## Deactivating a customer

1. Click **Delete** on an active customer row.
2. Confirm when prompted.

The customer is **soft-deleted** (`isActive` set to false): they no longer appear as active in normal lists, but historical transactions and audit data remain intact.

## On-account balance and payments

When **On-account sales** is enabled in **Settings** (see [Settings & Configuration](./12-settings.md)):

- **POS** can attach a customer and use **On account** as a payment method so the sale increases **balance due**.
- The customer list shows **Balance due** per customer.
- For customers with a positive balance, use **Record payment** to post a **cash, card, digital, check, or other** payment against the balance (optional notes).
- When adding or editing a customer, set an optional **Credit limit** to cap on-account debt. Leave the field empty for no limit. Checkout is blocked if a sale would exceed the limit.

For full feature documentation — split payments, refunds, API, and troubleshooting — see [Customer Credit (On-Account Sales)](../customer-credit.md).

## Linking customers at the POS

On the main POS screen:

1. Open the **customer** panel (e.g. **Select Customer** in the cart area).
2. Search by name, email, or phone.
3. Choose a customer to attach them to the sale.

When a customer is selected, you may see **loyalty points** and **balance due** (if applicable) in the panel so cashiers can confirm the right account before payment.

## Tags

Tags are free-form strings (e.g. **VIP**, **PWD**, **Wholesale**). Enter them as comma-separated values when creating or editing a customer. They help filtering and reporting mentally; advanced segment tools may live under **Admin > CRM** when that module is enabled.

## Related guides

- [Customer Credit (On-Account Sales)](../customer-credit.md) — Full reference for balance due, credit limits, payments, and refunds  
- [Point of Sale](./03-point-of-sale.md) — Attaching customers and on-account checkout  
- [Settings & Configuration](./12-settings.md) — Customer Management and On-account toggles  
- [Subscriptions & Billing](./14-subscriptions.md) — Plan features that gate customer tools  
