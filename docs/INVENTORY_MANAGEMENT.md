# Inventory Management System

This document describes the comprehensive inventory management system implemented for the POS application.

## Features Implemented

### ✅ 1. Real-time Stock Tracking
- **Server-Sent Events (SSE)** endpoint for real-time stock updates
- Polling-based approach (every 2 seconds) for reliable updates
- Supports filtering by product and branch
- Heartbeat mechanism to keep connections alive
- Frontend component: `RealTimeStockTracker`

**API Endpoint:** `GET /api/inventory/realtime`

### ✅ 2. Low-Stock Alerts
- Automatic detection of products below threshold
- Configurable threshold per product or tenant-wide
- Real-time alert updates
- Frontend component: `LowStockAlerts`
- Displays alerts with product name, SKU, and current stock

**API Endpoint:** `GET /api/inventory/low-stock`

### ✅ 3. Auto-decrement Items Per Sale
- Stock automatically decreases when transactions are completed
- Supports variations and bundles
- Tracks stock movements with full audit trail
- Prevents sales when stock is insufficient

**Implementation:** Updated `app/api/transactions/route.ts` to use new stock management functions

### ✅ 4. Multi-Branch Stock Monitoring
- **Branch Model** (`models/Branch.ts`) for managing multiple locations
- Branch-specific stock levels in products
- Filter stock movements by branch
- Branch management API endpoints

**API Endpoints:**
- `GET /api/branches` - List all branches
- `POST /api/branches` - Create new branch
- `GET /api/branches/[id]` - Get branch details
- `PUT /api/branches/[id]` - Update branch
- `DELETE /api/branches/[id]` - Deactivate branch

### ✅ 5. Item Variations (Size, Color, Type)
- Extended Product model to support variations
- Variation-specific stock tracking
- Variation-specific pricing
- Variation-specific SKUs
- Stock movements tracked per variation

**Product Model Extensions:**
```typescript
hasVariations: boolean;
variations?: IProductVariation[];
// Where IProductVariation includes:
// - size, color, type
// - sku, price, stock
```

### ✅ 6. Bundled Products
- **ProductBundle Model** (`models/ProductBundle.ts`)
- Bundle contains multiple products/services
- Stock automatically decrements for all bundle items
- Bundle-specific pricing
- Bundle management API endpoints

**API Endpoints:**
- `GET /api/bundles` - List all bundles
- `POST /api/bundles` - Create new bundle
- `GET /api/bundles/[id]` - Get bundle details
- `PUT /api/bundles/[id]` - Update bundle
- `DELETE /api/bundles/[id]` - Deactivate bundle

## Database Models

### Branch Model
- `tenantId` - Multi-tenant support
- `name`, `code` - Branch identification
- `address`, `phone`, `email` - Contact information
- `managerId` - Branch manager reference
- `isActive` - Soft delete support

### Product Model Extensions
- `productType` - 'regular' | 'bundle' | 'service'
- `hasVariations` - Boolean flag
- `variations[]` - Array of variation objects
- `branchStock[]` - Branch-specific stock levels
- `trackInventory` - Enable/disable inventory tracking
- `lowStockThreshold` - Product-specific threshold

### ProductBundle Model
- `tenantId` - Multi-tenant support
- `name`, `description`, `price`
- `items[]` - Array of bundle items (products with quantities)
- `trackInventory` - Whether to track bundle item stock
- `isActive` - Soft delete support

### StockMovement Model Extensions
- `branchId` - Branch-specific movements
- `variation` - Variation-specific movements (size, color, type)

## Stock Management Library

The `lib/stock.ts` library provides comprehensive stock management functions:

### Functions

1. **`getProductStock(productId, tenantId, options)`**
   - Get current stock for a product
   - Supports branch and variation filtering
   - Returns 999999 for non-tracked products

2. **`updateStock(productId, tenantId, quantity, type, options)`**
   - Update product stock
   - Supports variations and branches
   - Creates stock movement records
   - Validates stock levels

3. **`updateBundleStock(bundleId, tenantId, quantity, type, options)`**
   - Update stock for all items in a bundle
   - Handles bundle item quantities correctly

4. **`getStockMovements(productId, tenantId, options)`**
   - Get stock movement history
   - Supports branch and variation filtering

5. **`checkLowStock(productId, tenantId, threshold)`**
   - Check if product is low on stock

6. **`getLowStockProducts(tenantId, branchId, threshold)`**
   - Get all products with low stock
   - Supports branch filtering

## Frontend Components

### LowStockAlerts Component
- Displays low stock products
- Auto-refresh capability
- Click to navigate to product
- Color-coded alerts (red for out of stock, yellow for low stock)

### RealTimeStockTracker Component
- Connects to SSE endpoint
- Shows connection status
- Handles stock update events
- Auto-reconnect on disconnect

### Inventory Dashboard
- New page at `/[tenant]/[lang]/inventory`
- Displays low stock alerts
- Real-time stock tracking indicator
- Branch selector
- Feature overview

## Transaction Integration

The transaction API has been updated to:
- Check stock before processing transactions
- Support variations in transaction items
- Support bundles in transactions
- Update stock for all bundle items
- Track branch-specific transactions
- Handle variation-specific pricing

## Usage Examples

### Creating a Product with Variations
```typescript
{
  name: "T-Shirt",
  price: 29.99,
  hasVariations: true,
  variations: [
    { size: "S", color: "Red", stock: 10, price: 29.99 },
    { size: "M", color: "Red", stock: 15, price: 29.99 },
    { size: "L", color: "Blue", stock: 8, price: 31.99 }
  ]
}
```

### Creating a Bundle
```typescript
{
  name: "Service + Materials Package",
  price: 199.99,
  items: [
    { productId: "...", productName: "Service", quantity: 1 },
    { productId: "...", productName: "Material A", quantity: 2 },
    { productId: "...", productName: "Material B", quantity: 1 }
  ],
  trackInventory: true
}
```

### Creating a Branch
```typescript
{
  name: "Downtown Branch",
  code: "DT001",
  address: {
    street: "123 Main St",
    city: "City",
    state: "State",
    zipCode: "12345"
  },
  phone: "+1234567890",
  email: "downtown@example.com"
}
```

## API Usage

### Get Low Stock Products
```bash
GET /api/inventory/low-stock?tenant={tenant}&branchId={branchId}&threshold={threshold}
```

### Real-time Stock Updates
```javascript
const eventSource = new EventSource('/api/inventory/realtime?tenant={tenant}&productId={productId}');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle stock update
};
```

### Create Transaction with Variation
```json
{
  "items": [
    {
      "productId": "...",
      "quantity": 2,
      "variation": {
        "size": "M",
        "color": "Red"
      }
    }
  ],
  "paymentMethod": "cash",
  "cashReceived": 100,
  "branchId": "..."
}
```

### Create Transaction with Bundle
```json
{
  "items": [
    {
      "bundleId": "...",
      "quantity": 1
    }
  ],
  "paymentMethod": "card"
}
```

## Migration Notes

- Existing products will continue to work (backward compatible)
- New fields have default values
- `productType` defaults to 'regular'
- `hasVariations` defaults to false
- `trackInventory` defaults to true
- Existing stock values are preserved

## Future Enhancements

Potential future improvements:
- Stock transfer between branches
- Automated reorder points
- Supplier management
- Purchase order integration
- Stock valuation reports
- Inventory adjustment workflows
- Barcode scanning for variations
- Batch/lot tracking

