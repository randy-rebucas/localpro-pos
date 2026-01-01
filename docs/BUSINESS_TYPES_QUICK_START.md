# Business Types - Quick Start Guide

## Overview

The Standard POS Architecture supports multiple business types (retail, restaurant, laundry, service) while maintaining a consistent base schema. This guide shows you how to configure and use business types.

## Quick Setup

### 1. Set Business Type

Update your tenant settings to set the business type:

```typescript
// Via API
PATCH /api/tenants/[slug]/settings
{
  "businessType": "restaurant"
}
```

Or in the database:
```javascript
db.tenants.updateOne(
  { slug: "your-tenant" },
  { $set: { "settings.businessType": "restaurant" } }
);
```

### 2. Features Auto-Configure

Once business type is set, default features are automatically configured:

- **Retail**: Inventory, Categories, Discounts, Loyalty, Customers
- **Restaurant**: Inventory, Categories, Discounts, Loyalty, Customers, Booking
- **Laundry**: Categories, Discounts, Loyalty, Customers, Booking
- **Service**: Categories, Discounts, Loyalty, Customers, Booking

### 3. Create Products

Products are automatically validated based on business type:

```typescript
// Restaurant example
POST /api/products
{
  "name": "Margherita Pizza",
  "price": 12.99,
  "productType": "regular",
  "modifiers": [
    {
      "name": "Size",
      "options": [
        { "name": "Small", "price": 0 },
        { "name": "Large", "price": 3.00 }
      ],
      "required": true
    }
  ],
  "allergens": ["gluten", "dairy"]
}

// Laundry example
POST /api/products
{
  "name": "Wash & Fold",
  "price": 2.50,
  "productType": "service",
  "serviceType": "wash",
  "weightBased": true,
  "pickupDelivery": true,
  "estimatedDuration": 120
}

// Retail example
POST /api/products
{
  "name": "Blue Jeans",
  "price": 49.99,
  "sku": "JEANS-BLUE-32",
  "productType": "regular",
  "trackInventory": true,
  "stock": 25
}
```

## API Usage

### Get Business Types

```typescript
GET /api/business-types
// Returns all available business types

GET /api/business-types?type=restaurant
// Returns specific business type configuration
```

### Check Feature Support

```typescript
import { supportsFeature } from '@/lib/business-type-helpers';

if (supportsFeature(tenantSettings, 'booking')) {
  // Show booking features
}
```

### Validate Product

```typescript
import { validateProductForBusiness } from '@/lib/business-type-helpers';

const result = validateProductForBusiness(product, tenantSettings);
if (!result.valid) {
  console.error(result.errors);
}
```

## Business Type Examples

### Restaurant

**Settings**:
```json
{
  "businessType": "restaurant",
  "enableInventory": true,
  "enableBookingScheduling": true
}
```

**Product**:
```json
{
  "name": "Burger",
  "price": 8.99,
  "modifiers": [
    {
      "name": "Add-ons",
      "options": [
        { "name": "Cheese", "price": 1.00 },
        { "name": "Bacon", "price": 2.00 }
      ],
      "required": false
    }
  ],
  "allergens": ["gluten", "dairy"]
}
```

### Laundry

**Settings**:
```json
{
  "businessType": "laundry",
  "enableInventory": false,
  "enableBookingScheduling": true
}
```

**Service**:
```json
{
  "name": "Dry Clean Suit",
  "price": 15.00,
  "productType": "service",
  "serviceType": "dry-clean",
  "estimatedDuration": 180,
  "pickupDelivery": true
}
```

### Retail

**Settings**:
```json
{
  "businessType": "retail",
  "enableInventory": true,
  "enableCategories": true
}
```

**Product**:
```json
{
  "name": "T-Shirt",
  "price": 19.99,
  "sku": "TSHIRT-RED-M",
  "productType": "regular",
  "trackInventory": true,
  "stock": 50,
  "variations": [
    { "size": "M", "color": "Red", "stock": 25 },
    { "size": "L", "color": "Red", "stock": 25 }
  ]
}
```

## Migration

### Existing Tenant

1. **Set Business Type**:
```typescript
await Tenant.updateOne(
  { _id: tenantId },
  { $set: { 'settings.businessType': 'restaurant' } }
);
```

2. **Apply Defaults**:
```typescript
import { applyBusinessTypeDefaults } from '@/lib/business-types';

const tenant = await Tenant.findById(tenantId);
const updatedSettings = applyBusinessTypeDefaults(
  tenant.settings,
  tenant.settings.businessType
);
await Tenant.updateOne(
  { _id: tenantId },
  { $set: { settings: updatedSettings } }
);
```

## Best Practices

1. **Choose the Right Type**: Select the business type that best matches your primary operations
2. **Use Industry Fields**: Leverage industry-specific fields for better organization
3. **Validate Products**: Always validate products against business type
4. **Override When Needed**: You can override default features if needed

## Need Help?

- See [`BUSINESS_TYPES.md`](./BUSINESS_TYPES.md) for detailed documentation
- See [`STANDARD_POS_ARCHITECTURE.md`](../STANDARD_POS_ARCHITECTURE.md) for architecture details
