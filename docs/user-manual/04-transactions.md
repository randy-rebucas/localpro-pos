# 4. Transactions & Refunds

**Available to:** Cashier and above can view transactions. Refunds, voids, exports and adding expenses need **Manager** or above, unless your role permissions are set differently.

## Viewing Transactions

1. Navigate to **Transactions** from the sidebar
2. Sales and expenses appear together in one list, newest first, 10 per page. Each sale shows:
   - Receipt number
   - Date & Time
   - Items count
   - Payment method, plus cash received and change where there is any
   - Status (Completed, Refunded, Cancelled)
   - Total amount

Expenses show their name, date, payment method and description, with the amount as a minus figure.

### Choosing What to See

- Use the **All**, **Transactions** and **Expenses** tabs to show both or just one. Each tab has its own pages.
- Use **Grid View** or **List View** to change the layout. Your choice is remembered on this device.

### Searching

Use the search bar to find:
- Sales by receipt number or customer name
- Expenses by name or description

### Filtering

Click **Filters** to narrow the list:

| Filter | Options |
|--------|---------|
| **From / To** | Dates, using your store's timezone |
| **Status** | Completed, Refunded, Cancelled |
| **Payment** | Cash, Card, Digital, On account, Other |
| **Cashier** | The staff member who processed the sale or added the expense |
| **Branch** | Shown if you have branches |

Expenses have no status or branch, so choosing either shows sales only. Click **Clear filters** to start again.

## Transaction Details

Click the **View** (eye) icon on a sale to see:
- Receipt number and status
- Itemized list with prices and quantities
- Subtotal and discount, if one was applied
- Total
- Customer and cashier
- Payment method, cash received and change given
- The reason, if the sale was voided

Click **Print** to print the full receipt. If it can't be printed, a message asks you to check your printer settings.

## Adding a Transaction or Expense

- **Add Transaction** records a sale by hand. Enter the items, payment method and, for cash, the amount received.
- **Add Expense** records money paid out, with a name, description, amount, date and payment method.

## Processing a Refund

**Available to:** Manager and above, unless your role permissions are set differently

To refund a whole sale from this page:

1. Find the sale in the list
2. Click the **Adjust** (↺) icon, or open the details and click **Adjust**
3. Select the **reason** (required) and add any notes
4. Click **Process Refund**

To refund only some items, use **Refund** on the [Point of Sale](03-point-of-sale.md) screen, where you can choose items and quantities.

### After Refund

- The sale's status changes to **Refunded**
- **Stock is automatically restored** for refunded items, to the branch and variation they were sold from. Older sales of products with variations didn't record the variation, so that stock goes back to the main product stock and may need adjusting by hand.
- An audit log entry is created

### Refund Rules

- Only **Completed** transactions can be refunded from this page
- A sale that has been fully refunded can't be refunded again
- The refund reason is required

## Voiding a Sale

**Available to:** Manager and above, unless your role permissions are set differently

Voiding cancels a whole sale, usually to fix a mistake before the customer leaves:

1. Open the sale with the **View** (eye) icon
2. Click **Void**
3. Enter the **reason** (required)
4. Click **Void Sale**

Voiding reverses the stock, payment records, on-account balance, loyalty points and discount usage, and it can't be undone. It doesn't return money by itself, so give back any cash or reverse any card payment yourself. The sale stays in the list as **Cancelled**, with its reason, and is left out of sales reports and the cash drawer.

You can't void:
- A sale that has any refund on it
- An online store order. Refund it instead.
- An older sale of a product with variations, from before sales recorded which variation was sold. Refund it instead.

## Exporting

**Available to:** Manager and above, unless your role permissions are set differently

1. Set up the tab, search and filters you want
2. Click **CSV**, **XLSX** or **PDF** next to the download icon
3. The file downloads to your device

The export matches what's on screen across all pages, up to the newest 5,000 entries. PDF has fewer columns so it fits the page. Each export is recorded in the audit log.

## Transaction Statuses

| Status | Meaning |
|--------|---------|
| **Completed** | Sale processed and paid |
| **Refunded** | Refund issued |
| **Cancelled** | Sale voided |
