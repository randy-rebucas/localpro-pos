# Business Types Support

This document describes how the Standard POS Architecture supports different business types while maintaining consistency and scalability.

## Supported Business Types

### 1. Retail Store
**Type**: `retail`

**Characteristics**:
- Physical or online retail store
- Product-focused with inventory management
- SKU tracking required
- Product variations (size, color, etc.)

**Default Features**:
- ✅ Inventory Management
- ✅ Categories
- ✅ Discounts
- ✅ Loyalty Program
- ✅ Customer Management
- ❌ Booking/Scheduling

**Product Types**: `regular`, `bundle`

**Required Fields**:
- `name` - Product name
- `price` - Product price
- `sku` - Stock Keeping Unit

**Optional Fields**:
- `description`, `image`, `variations`, `branchStock`

**Example Use Cases**:
- Clothing stores
- Electronics stores
- Grocery stores
- General merchandise

---

### 2. Restaurant / Food Service
**Type**: `restaurant`

**Characteristics**:
- Food service establishment
- Menu items with modifiers
- Inventory for ingredients
- Table management (via bookings)

**Default Features**:
- ✅ Inventory Management
- ✅ Categories
- ✅ Discounts
- ✅ Loyalty Program
- ✅ Customer Management
- ✅ Booking/Scheduling

**Product Types**: `regular`, `bundle`, `service`

**Required Fields**:
- `name` - Menu item name
- `price` - Base price

**Optional Fields**:
- `description`, `image`, `modifiers`, `allergens`, `nutritionInfo`

**Industry-Specific Fields**:
- `modifiers` - Add-ons, toppings, options
- `allergens` - Allergen information
- `nutritionInfo` - Nutritional data

**Example Use Cases**:
- Restaurants
- Cafes
- Fast food
- Food trucks
- Catering

---

### 3. Laundry Service
**Type**: `laundry`

**Characteristics**:
- Service-based business
- Weight-based or fixed pricing
- Pickup/delivery options
- Service duration tracking

**Default Features**:
- ❌ Inventory Management (not applicable)
- ✅ Categories
- ✅ Discounts
- ✅ Loyalty Program
- ✅ Customer Management
- ✅ Booking/Scheduling

**Product Types**: `service`

**Required Fields**:
- `name` - Service name
- `price` - Service price

**Optional Fields**:
- `description`, `serviceType`, `weightBased`, `pickupDelivery`, `estimatedDuration`

**Industry-Specific Fields**:
- `serviceType` - wash, dry-clean, press, repair, other
- `weightBased` - If pricing is per unit weight
- `pickupDelivery` - Service includes pickup/delivery
- `estimatedDuration` - Estimated service time

**Example Use Cases**:
- Laundromats
- Dry cleaning
- Garment care
- Alteration services

---

### 4. Service Business
**Type**: `service`

**Characteristics**:
- General service business
- Time-based services
- Staff assignment
- Equipment requirements

**Default Features**:
- ❌ Inventory Management (not applicable)
- ✅ Categories
- ✅ Discounts
- ✅ Loyalty Program
- ✅ Customer Management
- ✅ Booking/Scheduling

**Product Types**: `service`

**Required Fields**:
- `name` - Service name
- `price` - Service price

**Optional Fields**:
- `description`, `serviceDuration`, `staffRequired`, `equipmentRequired`

**Industry-Specific Fields**:
- `serviceDuration` - Service duration in minutes
- `staffRequired` - Number of staff members needed
- `equipmentRequired` - List of required equipment

**Example Use Cases**:
- Salons
- Spas
- Repair services
- Consulting
- Professional services

---

### 5. General Business
**Type**: `general`

**Characteristics**:
- General purpose POS
- Flexible configuration
- All product types supported

**Default Features**:
- ✅ Inventory Management
- ✅ Categories
- ✅ Discounts
- ❌ Loyalty Program (optional)
- ✅ Customer Management
- ❌ Booking/Scheduling (optional)

**Product Types**: `regular`, `bundle`, `service`

**Required Fields**:
- `name` - Product/service name
- `price` - Price

**Optional Fields**:
- `description`, `image`, `sku`

**Example Use Cases**:
- Mixed businesses
- Custom configurations
- Testing/development

---

## Business Type Configuration

### Setting Business Type

Business type is set in Tenant settings:

```typescript
{
  businessType: 'retail' | 'restaurant' | 'laundry' | 'service' | 'general'
}
```

### Automatic Feature Configuration

When a business type is set, default features are automatically configured:

```typescript
import { applyBusinessTypeDefaults } from '@/lib/business-types';

const settings = applyBusinessTypeDefaults(existingSettings, 'restaurant');
// Automatically enables booking, inventory, etc. based on restaurant defaults
```

### Feature Override

Features can be manually overridden regardless of business type:

```typescript
{
  businessType: 'retail',
  enableBookingScheduling: true // Override default (normally false for retail)
}
```

---

## Product Model Extensions

The Product model includes industry-specific fields that are optional and used based on business type:

### Restaurant Fields
```typescript
{
  modifiers: [
    {
      name: "Size",
      options: [
        { name: "Small", price: 0 },
        { name: "Large", price: 2.00 }
      ],
      required: true
    }
  ],
  allergens: ["gluten", "dairy"],
  nutritionInfo: {
    calories: 350,
    protein: 15,
    carbs: 45,
    fat: 12
  }
}
```

### Laundry Fields
```typescript
{
  serviceType: "wash",
  weightBased: true,
  pickupDelivery: true,
  estimatedDuration: 60
}
```

### Service Fields
```typescript
{
  serviceDuration: 90,
  staffRequired: 2,
  equipmentRequired: ["chair", "styling tools"]
}
```

---

## Validation

Products are automatically validated based on business type:

```typescript
import { validateProductForBusiness } from '@/lib/business-type-helpers';

const result = validateProductForBusiness(product, tenantSettings);
if (!result.valid) {
  console.error(result.errors);
}
```

**Validation Rules**:
- Required fields checked based on business type
- Product type must be allowed for business type
- Business-specific field validation

---

## API Usage

### Get Business Type Configuration

```typescript
import { getBusinessTypeConfig } from '@/lib/business-types';

const config = getBusinessTypeConfig('restaurant');
console.log(config.defaultFeatures);
console.log(config.productTypes);
```

### Check Feature Support

```typescript
import { supportsFeature } from '@/lib/business-type-helpers';

if (supportsFeature(tenantSettings, 'booking')) {
  // Show booking features
}
```

### Format Product for Display

```typescript
import { formatProductForDisplay } from '@/lib/business-type-helpers';

const display = formatProductForDisplay(product, tenantSettings);
// Returns formatted title, subtitle, price, and details
```

---

## Migration Guide

### Setting Business Type for Existing Tenants

1. **Update Tenant Settings**:
```typescript
await Tenant.updateOne(
  { _id: tenantId },
  { 
    $set: { 
      'settings.businessType': 'restaurant',
      'settings.enableBookingScheduling': true 
    } 
  }
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

3. **Validate Existing Products**:
```typescript
import { validateProductForBusiness } from '@/lib/business-type-helpers';

const products = await Product.find({ tenantId });
for (const product of products) {
  const validation = validateProductForBusiness(product, tenant.settings);
  if (!validation.valid) {
    console.warn(`Product ${product.name} has issues:`, validation.errors);
  }
}
```

---

## Best Practices

### 1. Choose Appropriate Business Type
- Select the business type that best matches your primary operations
- Use `general` if you need maximum flexibility

### 2. Leverage Industry-Specific Fields
- Use industry-specific fields for better data organization
- Example: Use `modifiers` for restaurant menu items

### 3. Feature Flags
- Enable/disable features based on actual needs
- Don't enable features you won't use

### 4. Product Type Selection
- Use `service` for time-based services
- Use `regular` for physical products
- Use `bundle` for product packages

### 5. Validation
- Always validate products against business type
- Provide clear error messages for validation failures

---

## Examples

### Restaurant Setup
```typescript
{
  businessType: 'restaurant',
  enableInventory: true,
  enableBookingScheduling: true,
  enableCustomerManagement: true
}

// Product example
{
  name: "Margherita Pizza",
  price: 12.99,
  productType: "regular",
  modifiers: [
    {
      name: "Size",
      options: [
        { name: "Small (10\")", price: 0 },
        { name: "Large (14\")", price: 3.00 }
      ],
      required: true
    }
  ],
  allergens: ["gluten", "dairy"]
}
```

### Laundry Setup
```typescript
{
  businessType: 'laundry',
  enableInventory: false,
  enableBookingScheduling: true,
  enableCustomerManagement: true
}

// Service example
{
  name: "Wash & Fold",
  price: 2.50,
  productType: "service",
  serviceType: "wash",
  weightBased: true,
  pickupDelivery: true,
  estimatedDuration: 120
}
```

### Retail Setup
```typescript
{
  businessType: 'retail',
  enableInventory: true,
  enableCategories: true,
  enableDiscounts: true
}

// Product example
{
  name: "Blue Jeans",
  price: 49.99,
  sku: "JEANS-BLUE-32",
  productType: "regular",
  trackInventory: true,
  stock: 25,
  variations: [
    { size: "32", color: "Blue", stock: 10 },
    { size: "34", color: "Blue", stock: 15 }
  ]
}
```

---

## Conclusion

The Standard POS Architecture supports multiple business types through:

1. **Business Type Configuration** - Predefined configurations for each type
2. **Feature Flags** - Automatic feature enablement based on type
3. **Industry-Specific Fields** - Optional fields for specialized needs
4. **Validation** - Type-specific validation rules
5. **Flexibility** - Override defaults as needed

All business types use the same base schema (Universal POS Objects) while allowing industry-specific customizations through configuration and optional fields.
