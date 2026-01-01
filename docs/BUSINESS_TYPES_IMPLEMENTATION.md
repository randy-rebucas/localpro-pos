# Business Types Implementation Guide

This document describes the complete implementation of business types support in the Standard POS Architecture.

## Implementation Status

✅ **All features implemented and working**

### 1. Settings API Auto-Configuration ✅

**File**: `app/api/tenants/[slug]/settings/route.ts`

When a business type is set or changed via the settings API, features are automatically configured:

```typescript
// When businessType is set in settings
PUT /api/tenants/[slug]/settings
{
  "businessType": "restaurant"
}

// Automatically applies:
// - enableBookingScheduling: true
// - enableInventory: true
// - enableCategories: true
// - etc.
```

**How it works**:
- Detects when `businessType` is being set or changed
- Calls `applyBusinessTypeDefaults()` to merge default features
- Preserves existing settings that aren't overridden

### 2. Product Validation ✅

**Files**: 
- `app/api/products/route.ts` (POST)
- `app/api/products/[id]/route.ts` (PUT)

Products are validated against business type requirements:

```typescript
// Product creation/update automatically validates:
// - Required fields based on business type
// - Product type compatibility
// - Business-specific field validation
```

**Validation includes**:
- Required fields check (e.g., SKU for retail)
- Product type validation (e.g., only 'service' for laundry)
- Business-specific validations (e.g., modifiers for restaurant)

### 3. Default Product Settings ✅

When creating products, default settings are applied based on business type:

```typescript
// Retail products automatically get:
// - trackInventory: true
// - productType: 'regular'

// Service products automatically get:
// - trackInventory: false
// - productType: 'service'
```

### 4. Migration Utility ✅

**File**: `scripts/apply-business-type-defaults.ts`

Utility script to apply business type defaults to existing tenants:

```bash
# Apply to all tenants
npx tsx scripts/apply-business-type-defaults.ts

# Apply to specific tenant
npx tsx scripts/apply-business-type-defaults.ts my-tenant

# Apply with business type
npx tsx scripts/apply-business-type-defaults.ts my-tenant restaurant
```

## Usage Examples

### Setting Business Type

**Via API**:
```typescript
PUT /api/tenants/my-tenant/settings
{
  "businessType": "restaurant"
}
```

**Response**: Features automatically configured
```json
{
  "success": true,
  "data": {
    "businessType": "restaurant",
    "enableInventory": true,
    "enableBookingScheduling": true,
    "enableCategories": true,
    // ... other settings
  }
}
```

### Creating Products

**Restaurant Product**:
```typescript
POST /api/products
{
  "name": "Pizza",
  "price": 12.99,
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
```

**Validation**:
- ✅ Product type allowed for restaurant
- ✅ Required fields present
- ✅ Modifiers structure valid

**Retail Product**:
```typescript
POST /api/products
{
  "name": "T-Shirt",
  "price": 19.99,
  "sku": "TSHIRT-RED-M",
  "productType": "regular",
  "trackInventory": true,
  "stock": 50
}
```

**Validation**:
- ✅ SKU required (retail requirement)
- ✅ Product type allowed
- ✅ Inventory tracking enabled

**Laundry Service**:
```typescript
POST /api/products
{
  "name": "Wash & Fold",
  "price": 2.50,
  "productType": "service",
  "serviceType": "wash",
  "weightBased": true,
  "pickupDelivery": true
}
```

**Validation**:
- ✅ Product type must be 'service' (laundry requirement)
- ✅ Service type valid
- ✅ No inventory tracking (service business)

## API Endpoints

### Business Types

**Get all business types**:
```
GET /api/business-types
```

**Get specific business type**:
```
GET /api/business-types?type=restaurant
```

### Settings

**Update settings (auto-configures features)**:
```
PUT /api/tenants/[slug]/settings
{
  "businessType": "restaurant"
}
```

### Products

**Create product (validates against business type)**:
```
POST /api/products
{
  "name": "Product Name",
  "price": 10.00,
  // ... other fields
}
```

**Update product (validates against business type)**:
```
PUT /api/products/[id]
{
  "name": "Updated Name",
  // ... other fields
}
```

## Error Handling

### Business Type Validation Errors

When a product doesn't meet business type requirements:

```json
{
  "success": false,
  "errors": [
    {
      "field": "businessType",
      "message": "SKU is required for retail products",
      "code": "businessTypeValidation"
    }
  ]
}
```

### Common Validation Errors

1. **Missing Required Fields**:
   - Retail: SKU required
   - All: Name and price required

2. **Invalid Product Type**:
   - Laundry: Only 'service' allowed
   - Restaurant: 'regular', 'bundle', or 'service' allowed

3. **Business-Specific Validation**:
   - Restaurant: Modifiers must have options
   - Laundry: Weight-based services need base price

## Testing

### Manual Testing

1. **Set Business Type**:
```bash
curl -X PUT http://localhost:3000/api/tenants/test-tenant/settings \
  -H "Content-Type: application/json" \
  -d '{"businessType": "restaurant"}'
```

2. **Verify Features**:
```bash
curl http://localhost:3000/api/tenants/test-tenant/settings
```

3. **Create Product**:
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "price": 10.00
  }'
```

### Migration Testing

```bash
# Apply defaults to all tenants
npx tsx scripts/apply-business-type-defaults.ts

# Apply to specific tenant
npx tsx scripts/apply-business-type-defaults.ts my-tenant restaurant
```

## Troubleshooting

### Features Not Auto-Configuring

**Issue**: Setting business type doesn't update features

**Solution**: 
- Check that `applyBusinessTypeDefaults` is imported
- Verify business type is being set (not just passed in body)
- Check console for errors

### Product Validation Failing

**Issue**: Valid products are being rejected

**Solution**:
- Check tenant settings are loaded correctly
- Verify business type is set in tenant settings
- Review validation errors in response

### Migration Script Not Working

**Issue**: Script fails or doesn't update tenants

**Solution**:
- Ensure MongoDB connection is working
- Check tenant slugs are correct
- Verify business type is set before running script

## Best Practices

1. **Set Business Type First**: Set business type before creating products
2. **Use Migration Script**: Run migration script for existing tenants
3. **Validate Early**: Validate products before saving
4. **Check Features**: Verify features are enabled after setting business type
5. **Test Products**: Test product creation for your business type

## Next Steps

- ✅ Business type configuration
- ✅ Auto-feature configuration
- ✅ Product validation
- ✅ Migration utility
- 🔄 UI integration (future)
- 🔄 Business type selector in settings (future)

## Conclusion

All business type setups from the Quick Start Guide are now fully implemented and working:

1. ✅ Setting business type auto-configures features
2. ✅ Products are validated against business type
3. ✅ Default product settings applied automatically
4. ✅ Migration utility available for existing tenants
5. ✅ API endpoints working correctly

The system is ready for use across different business types!
