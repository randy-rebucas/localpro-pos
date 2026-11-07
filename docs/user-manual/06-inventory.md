# 6. Inventory Management

**Available to:** Manager, Admin, Owner

## Inventory Overview

1. Navigate to **Inventory** from the sidebar
2. The overview displays:
   - A count of low stock alerts, at the top of the page
   - **Low Stock Alerts**, listing items at or below their threshold, including out-of-stock items
   - **Predicted Stockouts**, showing how many days each item has left at its recent sales rate (needs the inventory management permission)
   - **Quick Actions** for Products, Stock Movements and Bundles
3. Use **Previous** and **Next** to page through long lists: Low Stock Alerts shows 8 items at a time and Predicted Stockouts shows 5
4. Use **Branch** to filter the low stock alerts and the audit sheet to one branch
5. Click **Print Audit Sheet** to download a PDF for a stock count

## Stock Levels

Each product with stock tracking enabled shows:

| Column | Description |
|--------|-------------|
| **Product** | Name and SKU |
| **Current Stock** | Quantity on hand |
| **Low Stock Threshold** | Alert trigger level |
| **Status** | In Stock, Low, Out of Stock |
| **Last Movement** | Date of last stock change |

### Status Tags

In **Low Stock Alerts**, each line shows current stock against its threshold, with a tag:

- **Low stock** (outlined) — Stock is at or below the low threshold
- **Out of stock** (red) — 0 units

In **Predicted Stockouts**, the days-left figure is red at 3 days or fewer, dark at 7 days or fewer, and outlined beyond that.

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

Use this when receiving a delivery that covers many products at once, instead of restocking one at a time:

1. Navigate to **Admin > Products**
2. Check the box next to each product you're receiving stock for (use **Select All** if the whole visible list is part of the delivery)
3. Click **Restock Selected** in the toolbar that appears
4. A list of the selected products opens, each with its current stock and a quantity box — enter the quantity received for each (leave blank to skip a product)
5. Click **Restock**

Products with variations can't be restocked here, because the delivery has to go to a specific variation. Use **Refill** on the Products page for those.

Each product is updated and logged individually (as a **Purchase** stock movement), so even if one line fails validation, the rest are still applied — the confirmation shows how many succeeded and lists any that failed.

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
