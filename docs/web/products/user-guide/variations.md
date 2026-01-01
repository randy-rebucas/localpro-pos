# Product Variations - User Guide

Complete guide to creating and managing product variations (sizes, colors, types).

## Overview

Product variations allow you to sell the same product in different sizes, colors, or types, each with its own price and stock level.

## When to Use Variations

Use variations when:
- Product comes in multiple sizes (Small, Medium, Large)
- Product comes in multiple colors (Red, Blue, Green)
- Product has different types (Regular, Premium, Deluxe)
- Different variations have different prices
- Stock needs to be tracked separately per variation

## Understanding Variations

### Base Product vs Variations

**Base Product**: The main product entry
- Has base price
- Has base stock (if no variations)

**Variations**: Different versions of the product
- Each has its own price (optional)
- Each has its own stock
- Each can have its own SKU

### Example: T-Shirt

**Base Product**: T-Shirt
- Base Price: $29.99

**Variations**:
- Small, Red: $29.99, Stock: 10, SKU: TSHIRT-SM-RED
- Medium, Blue: $29.99, Stock: 15, SKU: TSHIRT-MD-BLUE
- Large, Green: $34.99, Stock: 8, SKU: TSHIRT-LG-GREEN

> **Screenshot Placeholder**: [Add screenshot of product with variations displayed]

## Creating Variations

### Step 1: Create Base Product

1. Add product as normal
2. Enter base product information
3. Don't set stock yet (if using variations)

> **Screenshot Placeholder**: [Add screenshot of base product creation]

### Step 2: Add Variations Section

1. Scroll to **"Variations"** section
2. Click **"Add Variation"** button
3. Variation form appears

> **Screenshot Placeholder**: [Add screenshot of variations section]

### Step 3: Configure Variation

Fill in variation details:

#### Size Variation

1. Select **"Size"** as variation type
2. Enter size value (e.g., "Small", "Medium", "Large")
3. Enter price (or leave blank to use base price)
4. Enter stock quantity
5. Enter SKU (optional, auto-generated if blank)

> **Screenshot Placeholder**: [Add screenshot of size variation form]

#### Color Variation

1. Select **"Color"** as variation type
2. Enter color value (e.g., "Red", "Blue", "Green")
3. Enter price (if different)
4. Enter stock quantity
5. Enter SKU

> **Screenshot Placeholder**: [Add screenshot of color variation form]

#### Type Variation

1. Select **"Type"** as variation type
2. Enter type value (e.g., "Regular", "Premium")
3. Enter price (usually different)
4. Enter stock quantity
5. Enter SKU

> **Screenshot Placeholder**: [Add screenshot of type variation form]

### Step 4: Add Multiple Variations

1. Click **"Add Another Variation"** after saving first
2. Repeat for each variation
3. All variations appear in list

> **Screenshot Placeholder**: [Add screenshot showing multiple variations]

### Step 5: Save Product

1. Review all variations
2. Click **"Save Product"**
3. Product with variations is created

> **Screenshot Placeholder**: [Add screenshot of save confirmation]

## Complex Variations

### Multiple Variation Types

You can combine variation types:

**Example: T-Shirt with Size and Color**

- Small, Red
- Small, Blue
- Medium, Red
- Medium, Blue
- Large, Red
- Large, Blue

> **Screenshot Placeholder**: [Add screenshot of complex variations]

### Creating Combined Variations

1. Add first variation type (e.g., Size: Small)
2. Add second variation type (e.g., Color: Red)
3. System creates combination
4. Repeat for all combinations

> **Screenshot Placeholder**: [Add screenshot showing how to create combined variations]

## Managing Variations

### Editing Variations

1. Go to product edit page
2. Find variation in list
3. Click **"Edit"** button
4. Modify variation details
5. Click **"Save"**

> **Screenshot Placeholder**: [Add screenshot of editing variation]

### Removing Variations

1. Go to product edit page
2. Find variation in list
3. Click **"Remove"** button
4. Confirm removal
5. Variation is deleted

> **Screenshot Placeholder**: [Add screenshot of removing variation]

### Updating Variation Stock

1. Go to product page
2. Find variation
3. Click **"Update Stock"**
4. Enter new quantity
5. Save

> **Screenshot Placeholder**: [Add screenshot of stock update]

## Variation Pricing

### Same Price for All Variations

If all variations have the same price:
- Set base product price
- Leave variation prices blank
- All variations use base price

> **Screenshot Placeholder**: [Add screenshot showing same price setup]

### Different Prices per Variation

If variations have different prices:
- Set base product price (optional)
- Set individual prices for each variation
- Variation prices override base price

> **Screenshot Placeholder**: [Add screenshot showing different prices]

### Pricing Examples

**Example 1: Same Price**
- Base: $29.99
- Small: (uses base) $29.99
- Medium: (uses base) $29.99
- Large: (uses base) $29.99

**Example 2: Different Prices**
- Base: $29.99
- Small: $24.99
- Medium: $29.99
- Large: $34.99

> **Screenshot Placeholder**: [Add screenshot of pricing examples]

## Variation Stock Management

### Separate Stock Tracking

Each variation tracks stock independently:
- Small, Red: Stock: 10
- Medium, Blue: Stock: 15
- Large, Green: Stock: 8

> **Screenshot Placeholder**: [Add screenshot of separate stock tracking]

### Stock Alerts

System alerts when variation stock is low:
- Configure low stock threshold
- Receive alerts per variation
- Restock individual variations

> **Screenshot Placeholder**: [Add screenshot of stock alerts]

## Using Variations in POS

### Selecting Variation

1. Customer selects product
2. Variation selector appears
3. Customer chooses variation
4. Correct price and stock shown
5. Add to cart

> **Screenshot Placeholder**: [Add screenshot of variation selection in POS]

### Variation Display

In POS, variations show:
- Variation name (e.g., "Large, Red")
- Price
- Stock availability
- SKU

> **Screenshot Placeholder**: [Add screenshot of variation in cart]

## Best Practices

### Naming Variations

- ✅ Use consistent naming (e.g., "Small", "Medium", "Large")
- ✅ Be descriptive
- ✅ Use standard sizes/colors
- ✅ Avoid abbreviations

### Stock Management

- ✅ Track stock per variation
- ✅ Set low stock alerts
- ✅ Monitor popular variations
- ✅ Restock proactively

### Pricing Strategy

- ✅ Price variations fairly
- ✅ Consider cost differences
- ✅ Review pricing regularly
- ✅ Update prices as needed

## Common Scenarios

### Scenario 1: Clothing Store

**Product**: T-Shirt
**Variations**: Sizes (S, M, L, XL) and Colors (Red, Blue, Green)

> **Screenshot Placeholder**: [Add screenshot of clothing variations]

### Scenario 2: Coffee Shop

**Product**: Coffee
**Variations**: Sizes (Small, Medium, Large) and Types (Regular, Decaf)

> **Screenshot Placeholder**: [Add screenshot of coffee variations]

### Scenario 3: Electronics Store

**Product**: Phone Case
**Variations**: Colors (Black, White, Red) and Types (Standard, Premium)

> **Screenshot Placeholder**: [Add screenshot of electronics variations]

## Troubleshooting

### Issue: Variation Not Appearing in POS

**Problem**: Variation doesn't show in POS

**Solution**:
- Check if variation has stock
- Verify variation is saved
- Check product is active
- Refresh POS page

> **Screenshot Placeholder**: [Add screenshot of troubleshooting variation display]

### Issue: Wrong Price Showing

**Problem**: Variation shows wrong price

**Solution**:
- Check variation price setting
- Verify base price
- Check if variation price overrides base
- Update price if needed

> **Screenshot Placeholder**: [Add screenshot of price troubleshooting]

## Related Documentation

- [Adding Products](./adding-products.md)
- [Product Bundles](./bundles.md)
- [Managing Inventory](./inventory.md)

---

**Last Updated**: 2024
