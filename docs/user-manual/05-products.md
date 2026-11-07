# 5. Products & Categories

**Available to:** Manager, Admin, Owner (full CRUD) | Viewer, Cashier (view only)

## Viewing Products

1. Navigate to **Products** from the sidebar
2. Products display as a grid or list (toggle view)
3. Each product shows its name, image, price and stock level, with an **Inactive** badge if it has been deactivated

### Filtering & Searching

- **Search** by product name, SKU, or barcode
- **Filter by Category** — Choose a category from the list
- **Filter by Status** — Active, Inactive, or All (defaults to Active). Deactivated products carry an **Inactive** badge next to their name so they're easy to spot once you switch the filter.
- **Sort** — By newest, name, price or stock level. Pinned products come first only under **Newest**.

The stock tag stands out once a product reaches its own **Low Stock Threshold**, or your store's default if it doesn't have one. It turns red at zero. Products that don't track stock show no tag.

## Adding a New Product

1. Navigate to **Admin > Products**
2. Click **Add Product**
3. Fill in the product details:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Product display name |
| **SKU** | Yes | Unique stock keeping unit code |
| **Barcode** | No | Scannable barcode number |
| **Category** | Yes | Product category |
| **Price** | Yes | Selling price |
| **Description** | No | Product description |
| **Image** | No | Product photo |
| **Tax Rule** | Yes | Taxable (12% VAT) or VAT-Exempt |
| **Track Stock** | Yes | Enable/disable inventory tracking |
| **Initial Stock** | If tracking | Starting quantity |
| **Low Stock Threshold** | If tracking | Alert when stock falls below this number |

4. Click **Save**

> **Duplicate name check:** As you type the product name (and again when you leave the field), the system checks for an existing active product with the same name. If one is found, a warning appears showing its SKU and current stock. You can still save if the two products are genuinely different (e.g. different pack sizes sharing a name) — the warning just prevents accidentally creating a second record for the same item, which would split its stock and history across two SKUs.

## Product Variations

For products sold in separate sizes, colors or types (retail and general stores):

1. Go to **Products** and add or edit a product
2. Under **Variations**, click **Add variation**
3. Fill in **Size**, **Color** and/or **Type**, using the same details on each variation
4. Optionally add a **SKU** and a **Price**. Leave the price empty to use the product's price
5. Enter the starting **Stock**
6. Click **Save**

At the register, choosing the product asks which variation to sell. Each variation has its own stock count, and the product shows their total.

- **Adding stock:** use **Refill** and choose the variation. Stock can't be typed over on an existing variation, so every change is recorded.
- **Removing a variation:** it has to be at 0 stock first.
- **Similar variations:** "L" and "L / Red" can't sit side by side, because a sale of "L" could match either.
- **Branches:** variation stock isn't tracked per branch.
- **Renaming a variation:** past sales keep the old name. If one of those sales is refunded or voided, its stock goes back to the main product stock and may need adjusting by hand.

Add stock through **Refill** on the Products page, which asks which variation to fill. **Bulk restock** and the stock option in **Bulk edit** on Admin > Products skip products with variations. The stock field in the Admin > Products form is locked for them.

**Scanning:** give a variation its own SKU and scanning that code at the register adds that variation straight to the cart. Scanning the product's own barcode still opens the variation picker. If a variation SKU matches another product's barcode or SKU, the other product wins, so keep them different.

## Product Bundles

Bundles group multiple products together at a special price:

1. Navigate to **Admin > Bundles**
2. Click **Create Bundle**
3. Enter bundle details:
   - **Bundle Name**
   - **Bundle Price** (typically lower than individual total)
   - **Component Products** — Select products and quantities
4. Click **Save**

When a bundle is sold:
- The bundle price is charged (not individual prices)
- Stock for each component product is reduced
- Bundle performance is tracked in analytics

## Categories

### Viewing Categories

1. Navigate to **Admin > Categories**
2. Categories display in a list with product counts

### Adding a Category

1. Click **Add Category**
2. Enter:
   - **Name** — Category display name
   - **Description** — Optional description
   - **Parent Category** — For subcategories (optional)
3. Click **Save**

### Editing / Deleting Categories

- Click any category to edit its details
- Click **Delete** to soft-delete (products are not deleted, just uncategorized)
- Deleted categories can be restored by an Admin

## Editing a Product

1. Navigate to **Admin > Products**
2. Click on the product
3. Modify any fields
4. Click **Save**

> **Note:** Changing a product's price does not affect past transactions. The new price applies to future sales only.

## Deactivating a Product

Instead of deleting, products are deactivated (soft delete):

1. Navigate to **Admin > Products**
2. Click the **Delete** (trash) icon on the product row
3. Confirm

The product is hidden from the POS and from the default product list, but remains in the database for historical records (past transactions and stock movements still reference it).

## Reactivating a Product

1. Navigate to **Products** or **Admin > Products**
2. Switch the **Status** filter to **Inactive** (or **All**) — deactivated products don't show under the default Active filter
3. Click the **Reactivate** (↺) icon on the product row, in place of the usual Delete icon
4. The product becomes active again immediately (visible in POS and listings)

Reactivating only restores visibility — it does not restore stock. If the product was deactivated for being out of stock, restock it separately (see [Inventory > Restocking](06-inventory.md#restocking-inventory)).

## Importing Products (Bulk)

If available in your subscription plan:

1. Navigate to **Admin > Products**
2. Click **Import**
3. Download the CSV template
4. Fill in product data following the template format
5. Upload the completed CSV
6. Review the preview and confirm
