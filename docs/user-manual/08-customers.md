# 8. Customers

**Available to:** Manager, Admin, Owner

## Customer List

1. Navigate to **Admin > Customers**
2. The list shows: name, email, phone, total purchases, last visit, tags

### Searching & Filtering

- **Search** by name, email, or phone number
- **Filter** by tags (e.g., VIP, Senior, PWD)
- **Sort** by name, total spent, last visit date

## Adding a Customer

1. Click **Add Customer**
2. Fill in the details:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Full name |
| **Email** | No | For receipts and notifications |
| **Phone** | No | For SMS notifications |
| **Address** | No | Billing/shipping address |
| **Tags** | No | Labels for categorization (VIP, SC, PWD) |
| **Notes** | No | Internal notes about the customer |

3. Click **Save**

## Customer Profile

Click any customer to view their profile:

- **Contact Information** — Name, email, phone, address
- **Purchase History** — All transactions linked to this customer
- **Total Spent** — Lifetime purchase total
- **Visit Count** — Number of transactions
- **Average Order Value** — Mean transaction amount
- **Tags** — Applied labels
- **Bookings** — Appointment history (if applicable)
- **Notes** — Internal notes

## Linking Customers to Sales

During a POS transaction:
1. Click **Select Customer** in the cart
2. Search for the customer
3. Select them
4. The sale is recorded against their profile

Benefits of linking customers:
- Track purchase history per customer
- Calculate customer lifetime value
- Send targeted notifications
- Apply customer-specific discounts

## Customer Tags

Tags help categorize customers:

| Tag | Purpose |
|-----|---------|
| **VIP** | High-value customers |
| **Senior** | Senior citizen (for SC discount) |
| **PWD** | Person with disability (for PWD discount) |
| **Wholesale** | Bulk buyers |
| **Custom tags** | Any label you create |

### Adding Tags

1. Open the customer profile
2. Click **Add Tag**
3. Select from existing tags or create a new one
4. Click **Save**

## Editing a Customer

1. Open the customer profile
2. Click **Edit**
3. Modify details
4. Click **Save**

## Deactivating a Customer

1. Open the customer profile
2. Click **Deactivate**
3. The customer is hidden from search but data is preserved

> **Note:** Customer records are never hard-deleted. This ensures transaction history and audit trail integrity.

## Customer Notifications

If email or SMS is configured, customers receive:
- **Transaction Receipts** — Emailed after each purchase
- **Booking Confirmations** — When appointments are created
- **Booking Reminders** — 24 hours before appointments
- **Welcome Message** — When first added to the system (if automation enabled)
