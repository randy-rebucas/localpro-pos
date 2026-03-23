# 6. Inventory Management

**Available to:** Manager, Admin, Owner

## Inventory Overview

1. Navigate to **Inventory** from the sidebar
2. The overview displays:
   - Total products tracked
   - Items below reorder threshold
   - Out-of-stock items
   - Total inventory value (at cost)

## Stock Levels

Each product with stock tracking enabled shows:

| Column | Description |
|--------|-------------|
| **Product** | Name and SKU |
| **Current Stock** | Quantity on hand |
| **Low Stock Threshold** | Alert trigger level |
| **Status** | In Stock, Low, Out of Stock |
| **Last Movement** | Date of last stock change |

### Status Colors

- **Green** — Stock is above the low threshold
- **Yellow** — Stock is at or below the low threshold
- **Red** — Out of stock (0 units)

## Stock Movements

Every stock change is recorded as a movement. Navigate to **Admin > Stock Movements** to view the history.

### Movement Types

| Type | Description | Stock Effect |
|------|-------------|-------------|
| **Sale** | Product sold via POS | Decrease |
| **Refund** | Product returned by customer | Increase |
| **Restock** | New stock received from supplier | Increase |
| **Adjustment** | Manual correction (count discrepancy) | Increase or Decrease |
| **Transfer Out** | Sent to another branch | Decrease |
| **Transfer In** | Received from another branch | Increase |
| **Damaged** | Damaged or expired items written off | Decrease |
| **Return to Supplier** | Items returned to vendor | Decrease |

### Viewing Movement History

1. Navigate to **Admin > Stock Movements**
2. Filter by:
   - Product name or SKU
   - Movement type
   - Date range
   - Branch
   - User who made the change
3. Each movement shows: timestamp, product, type, quantity, user, notes

## Restocking Inventory

### Quick Restock (Single Product)

1. Go to **Inventory**
2. Find the product
3. Click the **Restock** icon
4. Enter the quantity received
5. Optionally add a note (e.g., supplier invoice number)
6. Click **Confirm**

### Bulk Restock

1. Navigate to **Inventory**
2. Click **Bulk Restock**
3. Add multiple products and their quantities
4. Click **Submit All**

## Stock Adjustments

When physical count doesn't match system count:

1. Go to **Inventory**
2. Find the product
3. Click **Adjust**
4. Enter the **actual count** (system calculates the difference)
5. Select a reason:
   - Count correction
   - Damaged goods
   - Theft/shrinkage
   - Expired items
6. Add notes
7. Click **Confirm**

All adjustments are recorded in the audit log.

## Low Stock Alerts

The system automatically monitors stock levels:

- When stock falls below the threshold, a **Low Stock Alert** appears on:
  - The dashboard
  - The inventory page
  - Email notifications (if configured)
- Alerts are sent to Managers, Admins, and Owners

### Configuring Alerts

1. Set the **Low Stock Threshold** per product during creation or editing
2. Enable email alerts in **Settings > Notifications**

## Real-Time Stock Tracking

Stock updates happen in real-time:
- When a sale is processed, stock decreases immediately
- When a refund is issued, stock increases immediately
- The inventory page uses live updates (Server-Sent Events)
- No need to refresh the page to see current levels

## Stock Transfers (Multi-Branch)

If operating multiple branches:

1. Navigate to **Inventory**
2. Click **Transfer Stock**
3. Select:
   - **Source Branch** (where stock is coming from)
   - **Destination Branch** (where stock is going)
   - **Products and Quantities**
4. Add transfer notes
5. Click **Initiate Transfer**
6. The receiving branch confirms receipt

## Predictive Stock (Automation)

If enabled, the system can:
- Analyze sales trends to predict when stock will run out
- Suggest reorder quantities based on historical demand
- Auto-generate purchase order recommendations

Check **Settings > Automations** for predictive stock configuration.

## Exporting Inventory Data

1. Navigate to **Inventory**
2. Click **Export**
3. Choose format: CSV, Excel, or PDF
4. The export includes: product name, SKU, current stock, value, status
