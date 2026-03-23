# 5. Products & Categories

**Available to:** Manager, Admin, Owner (full CRUD) | Viewer, Cashier (view only)

## Viewing Products

1. Navigate to **Products** from the sidebar
2. Products display as a grid or list (toggle view)
3. Each product card shows: name, image, price, stock level, status

### Filtering & Searching

- **Search** by product name, SKU, or barcode
- **Filter by Category** — Select a category tab
- **Filter by Status** — Active, Inactive, Out of Stock
- **Sort** — By name, price, date added, stock level

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
| **Cost** | No | Purchase/cost price (for profit tracking) |
| **Description** | No | Product description |
| **Image** | No | Product photo |
| **Tax Rule** | Yes | Taxable (12% VAT) or VAT-Exempt |
| **Track Stock** | Yes | Enable/disable inventory tracking |
| **Initial Stock** | If tracking | Starting quantity |
| **Low Stock Threshold** | If tracking | Alert when stock falls below this number |

4. Click **Save**

## Product Variations

For products with multiple options (size, color, etc.):

1. In the product editor, scroll to **Variations**
2. Click **Add Variation**
3. Define variation attributes:
   - **Name** (e.g., "Large", "Red")
   - **SKU suffix** (e.g., "-LG", "-RED")
   - **Price adjustment** (optional — can differ from base price)
   - **Stock** (tracked independently per variation)
4. Add as many variations as needed
5. Click **Save**

Each variation has its own stock count and can have its own price.

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

1. Open the product
2. Toggle **Active** to off
3. Click **Save**

The product is hidden from the POS but remains in the database for historical records.

## Importing Products (Bulk)

If available in your subscription plan:

1. Navigate to **Admin > Products**
2. Click **Import**
3. Download the CSV template
4. Fill in product data following the template format
5. Upload the completed CSV
6. Review the preview and confirm
