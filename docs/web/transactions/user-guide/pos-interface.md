# POS Interface User Guide

Complete guide to using the Point of Sale (POS) interface in 1POS.

## Overview

The POS interface is the main screen for processing sales. It provides an intuitive, touch-friendly interface for cashiers to quickly add products, process payments, and generate receipts.

## Interface Layout

### Main Components

```
┌─────────────────────────────────────────────────────────┐
│  Header: Store Name, Date, User Info                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │              │  │  Shopping Cart                  │ │
│  │  Product     │  │  ┌───────────────────────────┐ │ │
│  │  Grid        │  │  │ Item 1        $10.99      │ │ │
│  │              │  │  │ Item 2        $15.50      │ │ │
│  │  [Product]   │  │  └───────────────────────────┘ │ │
│  │  [Product]   │  │                                 │ │
│  │  [Product]   │  │  Subtotal:        $26.49      │ │
│  │  ...         │  │  Discount:        -$2.65      │ │
│  │              │  │  Total:           $23.84      │ │
│  └──────────────┘  │                                 │ │
│                     │  [Process Payment]             │ │
│  Search: [_______]  └─────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

> **Screenshot Placeholder**: [Add screenshot of POS interface here]

## Getting Started

### Accessing the POS

1. Log in to your account
2. Navigate to **POS** from the main menu
3. The POS interface will load with available products

### Basic Workflow

1. **Add Products** - Click products or search for them
2. **Review Cart** - Check items and quantities
3. **Apply Discount** (optional) - Enter discount code
4. **Process Payment** - Select payment method and complete
5. **Print Receipt** (optional) - Generate receipt

## Adding Products

### Method 1: Click Product Card

1. Browse the product grid
2. Click on a product card
3. Product is added to cart with quantity 1
4. Click again to increase quantity

> **Screenshot Placeholder**: [Add screenshot showing product grid and adding to cart]

### Method 2: Search Products

1. Use the search bar at the top
2. Type product name, SKU, or description
3. Results appear as you type
4. Click product to add to cart

> **Screenshot Placeholder**: [Add screenshot showing search functionality]

### Method 3: Barcode Scanner

1. Connect barcode scanner (if available)
2. Scan product barcode
3. Product automatically added to cart

> **Screenshot Placeholder**: [Add screenshot showing barcode scanning]

## Managing Cart

### View Cart Items

The cart panel on the right shows:
- Product name
- Quantity
- Unit price
- Subtotal per item
- Total cart value

> **Screenshot Placeholder**: [Add screenshot of cart with multiple items]

### Adjust Quantities

1. Click on a cart item
2. Use +/- buttons to adjust quantity
3. Or type quantity directly
4. Click "Remove" to delete item

> **Screenshot Placeholder**: [Add screenshot showing quantity adjustment]

### Remove Items

1. Click on item in cart
2. Click "Remove" button
3. Item is removed from cart

## Applying Discounts

### Using Discount Codes

1. Click "Apply Discount" button
2. Enter discount code
3. Click "Apply"
4. Discount is calculated and applied
5. Updated total is shown

> **Screenshot Placeholder**: [Add screenshot showing discount application]

### Discount Types

- **Percentage Discount**: Reduces total by percentage
- **Fixed Amount**: Reduces total by fixed amount
- **Minimum Purchase**: Requires minimum purchase amount

## Processing Payments

### Step 1: Review Totals

Before processing payment, verify:
- Subtotal is correct
- Discount applied correctly (if any)
- Total amount is accurate

### Step 2: Select Payment Method

Choose from three payment methods:

#### Cash Payment

1. Select "Cash" payment method
2. Enter amount received
3. Change is calculated automatically
4. Click "Process Payment"

> **Screenshot Placeholder**: [Add screenshot of cash payment dialog]

#### Card Payment

1. Select "Card" payment method
2. Click "Process Payment"
3. Process card transaction
4. Confirm payment

> **Screenshot Placeholder**: [Add screenshot of card payment dialog]

#### Digital Payment

1. Select "Digital" payment method
2. Click "Process Payment"
3. Process digital payment (PayPal, Venmo, etc.)
4. Confirm payment

> **Screenshot Placeholder**: [Add screenshot of digital payment dialog]

### Step 3: Complete Transaction

1. Review payment details
2. Add transaction notes (optional)
3. Click "Complete Transaction"
4. Receipt is generated
5. Transaction is saved

> **Screenshot Placeholder**: [Add screenshot of transaction completion]

## Receipt Generation

### View Receipt

After completing a transaction:
1. Receipt is displayed automatically
2. Shows transaction details
3. Includes receipt number
4. Lists all items and totals

> **Screenshot Placeholder**: [Add screenshot of receipt display]

### Print Receipt

1. Click "Print Receipt" button
2. Select printer (if multiple)
3. Receipt is printed
4. Option to email receipt (if configured)

> **Screenshot Placeholder**: [Add screenshot of print dialog]

### Receipt Information

Receipts include:
- Store name and address
- Receipt number
- Date and time
- Items purchased
- Quantities and prices
- Subtotal
- Discount (if applied)
- Total
- Payment method
- Change (for cash)
- Thank you message

## Keyboard Shortcuts

### Quick Actions

- **Space** - Process payment (when cart has items)
- **Esc** - Cancel current action
- **Ctrl/Cmd + F** - Focus search bar
- **Ctrl/Cmd + P** - Print receipt (after transaction)
- **+/-** - Increase/decrease quantity (when item selected)

## Tips & Best Practices

### For Faster Transactions

1. **Use Search** - Faster than scrolling through products
2. **Memorize Product Locations** - Know where common products are
3. **Use Barcode Scanner** - Fastest way to add products
4. **Keyboard Shortcuts** - Speed up common actions
5. **Quick Payment** - Use Space key for quick payment

### For Accuracy

1. **Verify Quantities** - Always check quantities before payment
2. **Check Totals** - Review subtotal and total
3. **Confirm Payment Method** - Ensure correct payment type
4. **Count Change** - For cash payments, count change carefully
5. **Review Receipt** - Verify receipt before giving to customer

### For Customer Service

1. **Add Notes** - Note special requests or instructions
2. **Apply Discounts** - Honor valid discount codes
3. **Explain Totals** - Help customers understand charges
4. **Provide Receipt** - Always offer receipt
5. **Be Patient** - Help customers find products

## Common Scenarios

### Scenario 1: Multiple Items

1. Add first product
2. Continue adding products
3. Review all items in cart
4. Apply discount if applicable
5. Process payment

### Scenario 2: Quantity Change

1. Add product to cart
2. Click on cart item
3. Adjust quantity
4. Verify new total
5. Process payment

### Scenario 3: Discount Application

1. Add products to cart
2. Click "Apply Discount"
3. Enter discount code
4. Verify discount applied
5. Process payment

### Scenario 4: Cash with Change

1. Add products to cart
2. Select "Cash" payment
3. Enter amount received
4. Verify change amount
5. Complete transaction
6. Give change to customer

## Troubleshooting

### Product Not Found

**Problem**: Product doesn't appear in search

**Solution**:
- Check if product is active
- Verify spelling in search
- Try searching by SKU
- Check if product is out of stock

### Discount Not Working

**Problem**: Discount code not applying

**Solution**:
- Verify code is correct
- Check if code is expired
- Ensure minimum purchase met
- Check if usage limit reached

### Payment Processing Error

**Problem**: Payment fails to process

**Solution**:
- Check internet connection
- Verify payment method
- Try different payment method
- Contact administrator

### Receipt Not Printing

**Problem**: Receipt doesn't print

**Solution**:
- Check printer connection
- Verify printer is online
- Try printing from transaction history
- Check printer settings

## Related Documentation

- [Processing Sales](./processing-sales.md)
- [Payment Methods](./payments.md)
- [Applying Discounts](./discounts.md)
- [Transaction History](../user-guide/history.md)

---

**Last Updated**: 2024
