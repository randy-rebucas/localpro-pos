# Adding Products - User Guide

Complete guide to adding new products to your inventory.

## Overview

This guide walks you through the process of adding new products to your LocalPro POS system, including basic products, variations, and bundles.

## Prerequisites

Before adding products, ensure you have:
- Admin or Manager role permissions
- Product categories created (optional but recommended)
- Product information ready (name, price, stock, etc.)

## Accessing Product Management

1. Log in to your account
2. Navigate to **Admin** → **Products**
3. Click **"Add Product"** button

> **Screenshot Placeholder**: [Add screenshot of Products admin page with Add Product button]

## Basic Product Information

### Step 1: Enter Basic Details

Fill in the required product information:

#### Required Fields

- **Product Name** - Name of the product
- **Price** - Selling price
- **Stock** - Initial stock quantity
- **Category** - Product category (select from dropdown)

> **Screenshot Placeholder**: [Add screenshot of product form with required fields highlighted]

#### Optional Fields

- **Description** - Product description
- **SKU** - Stock Keeping Unit (auto-generated if not provided)
- **Image** - Product image (upload)
- **Notes** - Internal notes

> **Screenshot Placeholder**: [Add screenshot showing optional fields]

### Step 2: Select Category

1. Click category dropdown
2. Select appropriate category
3. Or create new category (if needed)

> **Screenshot Placeholder**: [Add screenshot of category selection]

### Step 3: Set Pricing

1. Enter base price
2. System validates price format
3. Price can be changed later

> **Screenshot Placeholder**: [Add screenshot of price input]

### Step 4: Set Initial Stock

1. Enter initial stock quantity
2. This is the starting inventory
3. Stock will be tracked automatically

> **Screenshot Placeholder**: [Add screenshot of stock input]

## Adding Product Variations

### When to Use Variations

Use variations when a product comes in different:
- Sizes (Small, Medium, Large)
- Colors (Red, Blue, Green)
- Types (Regular, Premium)

### Adding Variations

1. Scroll to **"Variations"** section
2. Click **"Add Variation"** button
3. Fill in variation details:
   - Size, Color, or Type
   - Price (if different from base)
   - Stock (if tracked separately)
   - SKU (if different)

> **Screenshot Placeholder**: [Add screenshot of variations section]

### Variation Example: T-Shirt

**Base Product**: T-Shirt
- Base Price: $29.99

**Variations**:
- Small, Red: $29.99, Stock: 10
- Medium, Blue: $29.99, Stock: 15
- Large, Green: $34.99, Stock: 8

> **Screenshot Placeholder**: [Add screenshot of complete variation example]

## Uploading Product Images

### Supported Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)

### Image Requirements

- Recommended size: 800x800 pixels
- Maximum file size: 5MB
- Square aspect ratio recommended

### Upload Process

1. Click **"Upload Image"** button
2. Select image file
3. Image preview appears
4. Click **"Save"** to confirm

> **Screenshot Placeholder**: [Add screenshot of image upload dialog]

## Setting Product Status

### Active/Inactive

- **Active** - Product appears in POS and is available for sale
- **Inactive** - Product is hidden from POS but kept in system

> **Screenshot Placeholder**: [Add screenshot of status toggle]

## Saving Product

### Before Saving

Review all information:
- ✅ Product name is correct
- ✅ Price is accurate
- ✅ Stock quantity is correct
- ✅ Category is selected
- ✅ Variations are correct (if any)
- ✅ Image is uploaded (if desired)

### Save Process

1. Click **"Save Product"** button
2. System validates all fields
3. Product is created
4. Success message appears
5. Redirected to product list

> **Screenshot Placeholder**: [Add screenshot of save button and success message]

## Complete Example

### Example: Adding a Coffee Product

**Step 1: Basic Information**
- Name: "Premium Coffee"
- Description: "Freshly roasted premium coffee beans"
- Price: $12.99
- Stock: 50
- Category: "Beverages"

**Step 2: Variations**
- Small (8oz): $8.99, Stock: 20
- Medium (12oz): $10.99, Stock: 20
- Large (16oz): $12.99, Stock: 10

**Step 3: Image**
- Upload coffee product image

**Step 4: Save**
- Click "Save Product"
- Product created successfully

> **Screenshot Placeholder**: [Add screenshot of complete example product]

## Quick Add Process

For simple products without variations:

1. Enter name
2. Enter price
3. Enter stock
4. Select category
5. Click Save

**Time**: ~30 seconds

## Bulk Import

### Using CSV Import

1. Click **"Import Products"** button
2. Download CSV template
3. Fill in product data
4. Upload CSV file
5. Review import preview
6. Confirm import

> **Screenshot Placeholder**: [Add screenshot of bulk import interface]

### CSV Format

```csv
Name,Price,Stock,Category,SKU,Description
Product 1,10.99,50,Category 1,SKU001,Description 1
Product 2,15.99,30,Category 2,SKU002,Description 2
```

> **Screenshot Placeholder**: [Add screenshot of CSV template]

## Editing Products

### Accessing Edit Mode

1. Go to Products list
2. Click on product
3. Click **"Edit"** button
4. Make changes
5. Click **"Save"**

> **Screenshot Placeholder**: [Add screenshot of edit button and edit form]

## Common Issues

### Issue: SKU Already Exists

**Problem**: Error message "SKU already exists"

**Solution**:
- Use different SKU
- Or edit existing product with that SKU
- SKU must be unique

> **Screenshot Placeholder**: [Add screenshot of SKU error message]

### Issue: Invalid Price Format

**Problem**: Price field shows error

**Solution**:
- Use numbers only (e.g., 10.99)
- No currency symbols
- Use decimal point, not comma

> **Screenshot Placeholder**: [Add screenshot of price format error]

### Issue: Category Not Found

**Problem**: Category doesn't appear in dropdown

**Solution**:
- Create category first (Admin → Categories)
- Or select "Uncategorized"
- Category can be added later

> **Screenshot Placeholder**: [Add screenshot of category dropdown]

## Best Practices

### Product Naming

- ✅ Use clear, descriptive names
- ✅ Include brand if applicable
- ✅ Be consistent with naming
- ✅ Avoid special characters

### Pricing

- ✅ Set competitive prices
- ✅ Include tax considerations
- ✅ Review prices regularly
- ✅ Update prices as needed

### Stock Management

- ✅ Set accurate initial stock
- ✅ Monitor stock levels
- ✅ Set low stock alerts
- ✅ Update stock regularly

### Categories

- ✅ Organize products logically
- ✅ Use consistent categories
- ✅ Create subcategories if needed
- ✅ Review category structure

## Related Documentation

- [Product Variations](./variations.md)
- [Product Bundles](./bundles.md)
- [Managing Inventory](./inventory.md)
- [Category Management](../categories/user-guide/managing-categories.md)

---

**Last Updated**: 2024
