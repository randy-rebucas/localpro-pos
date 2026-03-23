# 4. Transactions & Refunds

**Available to:** Cashier (view + refund), Manager, Admin, Owner (full access)

## Viewing Transactions

1. Navigate to **Transactions** from the sidebar
2. The transaction list shows:
   - Transaction ID / Receipt Number
   - Date & Time
   - Customer (if linked)
   - Items count
   - Total amount
   - Payment method
   - Status (Completed, Refunded, Voided, Pending)

### Filtering Transactions

| Filter | Options |
|--------|---------|
| **Date Range** | Today, This Week, This Month, Custom Range |
| **Status** | All, Completed, Refunded, Voided, Pending |
| **Payment Method** | Cash, Card, Digital, Split |
| **Cashier** | Filter by staff member who processed the sale |
| **Branch** | Filter by branch (if multi-branch) |

### Searching

- Use the search bar to find transactions by:
  - Receipt number
  - Customer name
  - Transaction ID

## Transaction Details

Click any transaction to view:
- Full itemized list with prices
- Discounts applied
- Tax breakdown (VATable, VAT Amount, VAT-Exempt)
- Payment method and amount tendered
- Change given (for cash)
- Cashier who processed the sale
- Timestamp
- Receipt serial number

## Processing a Refund

1. Find the original transaction (search or browse)
2. Click on the transaction to open details
3. Click **Refund**
4. Select which items to refund:
   - **Full Refund** — All items returned
   - **Partial Refund** — Select specific items and quantities
5. Enter the **reason for refund** (required)
6. Confirm the refund amount
7. Click **Process Refund**

### After Refund

- A refund receipt is generated with a new serial number
- The refund transaction is linked to the original sale
- **Stock is automatically restored** for refunded items
- The refund appears in reports as a negative transaction
- An audit log entry is created

### Refund Rules

- Only **Completed** transactions can be refunded
- A transaction can only be refunded **once**
- Refunds require the refund reason to be recorded
- All refunds are logged in the audit trail

## Voiding a Transaction

**Available to:** Manager, Admin, Owner only

Voiding cancels a transaction entirely (typically used for errors before the customer leaves):

1. Open the transaction
2. Click **Void**
3. Enter the reason
4. Confirm

> **Note:** Voided transactions remain in the system for audit purposes but are excluded from sales reports.

## Exporting Transactions

**Available to:** Manager, Admin, Owner

1. Go to **Transactions**
2. Apply desired filters (date range, status, etc.)
3. Click **Export**
4. Choose format:
   - **CSV** — For spreadsheet analysis
   - **Excel** — Formatted workbook
   - **PDF** — For printing or archiving
5. The file downloads to your device

## Transaction Statuses

| Status | Meaning |
|--------|---------|
| **Completed** | Sale processed and paid |
| **Refunded** | Full or partial refund issued |
| **Voided** | Transaction cancelled (no money exchanged) |
| **Pending** | Offline transaction awaiting sync |
