# Managing Stock - User Guide

Complete guide to managing inventory and stock levels in 1POS.

## Overview

Stock management allows you to track inventory levels, update stock quantities, and monitor stock movements. Stock is automatically updated when products are sold or refunded.

## Accessing Stock Management

### From Products Page

1. Navigate to **Admin** → **Products**
2. Click on a product
3. View current stock level
4. Click **"Update Stock"** or **"Refill Stock"**

> **Screenshot Placeholder**: [Add screenshot of product stock display]

### From Inventory Page

1. Navigate to **Inventory**
2. View all products with stock levels
3. Filter and search products
4. Update stock as needed

> **Screenshot Placeholder**: [Add screenshot of inventory page]

## Viewing Stock Levels

### Product Stock Display

Stock information shows:
- Current stock quantity
- Low stock indicator (if applicable)
- Stock status (In Stock, Low Stock, Out of Stock)
- Last updated date

> **Screenshot Placeholder**: [Add screenshot of stock level display]

### Stock Status Indicators

- **Green** - In Stock (above threshold)
- **Yellow** - Low Stock (below threshold)
- **Red** - Out of Stock (zero or negative)

> **Screenshot Placeholder**: [Add screenshot of stock status indicators]

## Updating Stock

### Method 1: Refill Stock

#### Step 1: Access Refill

1. Go to product page
2. Click **"Refill Stock"** button
3. Refill dialog appears

> **Screenshot Placeholder**: [Add screenshot of refill stock button]

#### Step 2: Enter Quantity

1. Enter quantity to add
2. Or use +/- buttons
3. Shows current stock
4. Shows new stock after refill

> **Screenshot Placeholder**: [Add screenshot of refill quantity input]

#### Step 3: Add Reason (Optional)

1. Enter reason for refill:
   - Restock
   - Purchase order
   - Transfer from another branch
   - Adjustment
2. Add notes if needed

> **Screenshot Placeholder**: [Add screenshot of refill reason]

#### Step 4: Confirm Refill

1. Review refill details
2. Click **"Refill Stock"**
3. Stock updated
4. Stock movement recorded

> **Screenshot Placeholder**: [Add screenshot of refill confirmation]

### Method 2: Adjust Stock

#### Step 1: Access Adjustment

1. Go to product page
2. Click **"Adjust Stock"** button
3. Adjustment dialog appears

> **Screenshot Placeholder**: [Add screenshot of adjust stock button]

#### Step 2: Set New Quantity

1. Enter new stock quantity
2. Or adjust by amount (+/-)
3. Shows current vs new quantity
4. Shows difference

> **Screenshot Placeholder**: [Add screenshot of stock adjustment]

#### Step 3: Enter Reason

1. Select adjustment type:
   - Count correction
   - Damage
   - Theft
   - Found
   - Other
2. Add detailed notes

> **Screenshot Placeholder**: [Add screenshot of adjustment reason]

#### Step 4: Confirm Adjustment

1. Review adjustment
2. Click **"Save Adjustment"**
3. Stock updated
4. Movement recorded

> **Screenshot Placeholder**: [Add screenshot of adjustment confirmation]

## Stock Movements

### Automatic Stock Updates

Stock is automatically updated when:
- ✅ Product is sold (decreased)
- ✅ Transaction is refunded (increased)
- ✅ Stock is manually adjusted
- ✅ Stock is refilled

> **Screenshot Placeholder**: [Add screenshot of automatic stock updates]

### Viewing Stock Movements

1. Go to **Admin** → **Stock Movements**
2. View all stock changes
3. Filter by product, type, date
4. See detailed movement history

> **Screenshot Placeholder**: [Add screenshot of stock movements page]

### Stock Movement Types

- **Sale** - Product sold (stock decreased)
- **Purchase** - Stock purchased (stock increased)
- **Adjustment** - Manual adjustment
- **Return** - Item returned (stock increased)
- **Damage** - Item damaged (stock decreased)
- **Transfer** - Stock transferred between branches

> **Screenshot Placeholder**: [Add screenshot of stock movement types]

## Low Stock Alerts

### Understanding Low Stock

Low stock alerts notify you when:
- Stock falls below threshold
- Product is running out
- Restocking is needed

> **Screenshot Placeholder**: [Add screenshot of low stock alert]

### Viewing Low Stock Items

1. Go to **Inventory** → **Low Stock**
2. View all low stock products
3. See current stock vs threshold
4. Take action to restock

> **Screenshot Placeholder**: [Add screenshot of low stock list]

### Setting Low Stock Threshold

1. Edit product
2. Go to "Stock Settings"
3. Set "Low Stock Threshold"
4. Save settings

> **Screenshot Placeholder**: [Add screenshot of threshold setting]

## Bulk Stock Operations

### Bulk Stock Update

1. Go to Products page
2. Select multiple products
3. Click **"Bulk Update Stock"**
4. Enter quantity to add/subtract
5. Confirm update

> **Screenshot Placeholder**: [Add screenshot of bulk stock update]

### Bulk Stock Import

1. Go to Products → Import
2. Download stock template
3. Fill in stock quantities
4. Upload file
5. Stock updated

> **Screenshot Placeholder**: [Add screenshot of bulk stock import]

## Stock Tracking

### Real-Time Stock Updates

Stock updates in real-time:
- Changes reflect immediately
- All users see updated stock
- No refresh needed
- Accurate inventory levels

> **Screenshot Placeholder**: [Add screenshot of real-time stock updates]

### Stock History

View stock history:
1. Go to product details
2. Click "Stock History"
3. View all stock changes
4. See trends over time

> **Screenshot Placeholder**: [Add screenshot of stock history]

## Multi-Branch Stock

### Branch-Specific Stock

If using multiple branches:
- Each branch has separate stock
- Stock tracked per branch
- Transfers between branches
- Branch-specific reports

> **Screenshot Placeholder**: [Add screenshot of branch stock]

### Stock Transfers

1. Go to Stock Movements
2. Click "Transfer Stock"
3. Select source branch
4. Select destination branch
5. Enter quantity
6. Process transfer

> **Screenshot Placeholder**: [Add screenshot of stock transfer]

## Stock Reports

### Inventory Report

1. Go to Reports → Inventory
2. View current stock levels
3. Filter by category, branch
4. Export report

> **Screenshot Placeholder**: [Add screenshot of inventory report]

### Stock Movement Report

1. Go to Reports → Stock Movements
2. View all stock changes
3. Filter by date, product, type
4. Analyze trends

> **Screenshot Placeholder**: [Add screenshot of stock movement report]

## Best Practices

### Regular Stock Checks

- ✅ Count stock regularly
- ✅ Compare physical vs system stock
- ✅ Investigate discrepancies
- ✅ Update stock as needed

### Stock Management

- ✅ Set appropriate thresholds
- ✅ Monitor low stock items
- ✅ Restock proactively
- ✅ Track fast-moving items

### Accuracy

- ✅ Update stock immediately
- ✅ Document all adjustments
- ✅ Verify stock after sales
- ✅ Regular audits

## Common Scenarios

### Scenario 1: Restocking

1. Receive new inventory
2. Go to product
3. Click "Refill Stock"
4. Enter received quantity
5. Reason: "Restock"
6. Save

> **Screenshot Placeholder**: [Add screenshot of restocking process]

### Scenario 2: Stock Correction

1. Physical count differs from system
2. Go to product
3. Click "Adjust Stock"
4. Enter correct quantity
5. Reason: "Count Correction"
6. Save

> **Screenshot Placeholder**: [Add screenshot of stock correction]

### Scenario 3: Damaged Items

1. Item is damaged
2. Go to product
3. Click "Adjust Stock"
4. Reduce quantity
5. Reason: "Damage"
6. Add notes about damage
7. Save

> **Screenshot Placeholder**: [Add screenshot of damaged item adjustment]

## Troubleshooting

### Issue: Stock Not Updating

**Problem**: Stock doesn't update after sale

**Solution**:
- Check product has "Track Inventory" enabled
- Verify transaction completed
- Check stock movements log
- Refresh page

> **Screenshot Placeholder**: [Add screenshot of stock update troubleshooting]

### Issue: Wrong Stock Level

**Problem**: Stock level is incorrect

**Solution**:
- Check stock movements
- Verify recent transactions
- Compare with physical count
- Adjust if needed

> **Screenshot Placeholder**: [Add screenshot of stock discrepancy]

## Related Documentation

- [Stock Movements](../stock-movements/user-guide/viewing-movements.md)
- [Low Stock Alerts](./low-stock-alerts.md)
- [Inventory Reports](../reports/inventory.md)

---

**Last Updated**: 2024
