# Inventory API - Mobile

Complete guide to managing inventory and stock from mobile applications.

## Overview

The Inventory API allows you to:
- View stock levels
- Update stock quantities
- Track stock movements
- Monitor low stock items
- Get real-time stock updates

## Endpoints

### Get Real-Time Stock

**Endpoint:** `GET /api/inventory/realtime`

**Query Parameters:**
- `productId` (string) - Get stock for specific product
- `categoryId` (string) - Get stock for category

**Example:**
```typescript
// Get all stock levels
const stock = await apiClient.request('/inventory/realtime');

// Get stock for specific product
const productStock = await apiClient.request(
  '/inventory/realtime?productId=product_id'
);
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "productId": "product_id",
      "name": "Product Name",
      "stock": 50,
      "lowStockThreshold": 10,
      "status": "in_stock"
    }
  ]
}
```

### Get Low Stock Items

**Endpoint:** `GET /api/inventory/low-stock`

**Query Parameters:**
- `threshold` (number) - Custom threshold (optional)

**Example:**
```typescript
const lowStock = await apiClient.request('/inventory/low-stock');

// With custom threshold
const customLowStock = await apiClient.request(
  '/inventory/low-stock?threshold=5'
);
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "productId": "product_id",
      "name": "Product Name",
      "stock": 5,
      "threshold": 10,
      "status": "low_stock"
    }
  ]
}
```

### Get Stock Movements

**Endpoint:** `GET /api/stock-movements`

**Query Parameters:**
- `page` (number) - Page number
- `limit` (number) - Items per page
- `type` (string) - Filter by type (sale, purchase, adjustment, etc.)
- `productId` (string) - Filter by product
- `startDate` (string) - Start date filter
- `endDate` (string) - End date filter

**Example:**
```typescript
// Get all movements
const movements = await apiClient.request('/stock-movements');

// Get movements for specific product
const productMovements = await apiClient.request(
  '/stock-movements?productId=product_id&type=sale'
);
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "movement_id",
      "productId": {
        "_id": "product_id",
        "name": "Product Name"
      },
      "type": "sale",
      "quantity": -2,
      "previousStock": 50,
      "newStock": 48,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

## Stock Update Operations

### Refill Stock

**Endpoint:** `POST /api/products/:id/refill`

**Request:**
```json
{
  "quantity": 10,
  "reason": "Restock"
}
```

**Example:**
```typescript
await apiClient.request(`/products/${productId}/refill`, {
  method: 'POST',
  body: {
    quantity: 10,
    reason: 'Restock'
  }
});
```

### Update Stock (Adjustment)

Use the products update endpoint to adjust stock:
```typescript
await apiClient.request(`/products/${productId}`, {
  method: 'PUT',
  body: {
    stock: 50  // Set new stock level
  }
});
```

## Real-Time Stock Updates

### Using Server-Sent Events (SSE)

For real-time stock updates, connect to SSE endpoint:

```typescript
const eventSource = new EventSource(
  `${API_BASE}/inventory/realtime?token=${token}`
);

eventSource.onmessage = (event) => {
  const stockUpdate = JSON.parse(event.data);
  // Update local stock data
  updateStockLevel(stockUpdate);
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  // Handle reconnection
};
```

## Stock Movement Types

- **sale** - Product sold (stock decreased)
- **purchase** - Stock purchased (stock increased)
- **adjustment** - Manual adjustment
- **return** - Item returned (stock increased)
- **damage** - Item damaged (stock decreased)
- **transfer** - Stock transferred between branches

## Complete Example

```typescript
class InventoryService {
  constructor(private apiClient: APIClient) {}

  async getStockLevels() {
    return this.apiClient.request('/inventory/realtime');
  }

  async getLowStockItems(threshold?: number) {
    const params = threshold ? `?threshold=${threshold}` : '';
    return this.apiClient.request(`/inventory/low-stock${params}`);
  }

  async getStockMovements(filters?: {
    productId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.productId) params.append('productId', filters.productId);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', String(filters.page));

    return this.apiClient.request(`/stock-movements?${params.toString()}`);
  }

  async refillStock(productId: string, quantity: number, reason?: string) {
    return this.apiClient.request(`/products/${productId}/refill`, {
      method: 'POST',
      body: { quantity, reason }
    });
  }

  async adjustStock(productId: string, newStock: number) {
    return this.apiClient.request(`/products/${productId}`, {
      method: 'PUT',
      body: { stock: newStock }
    });
  }
}
```

## Error Handling

```typescript
try {
  const stock = await inventoryService.getStockLevels();
} catch (error) {
  if (error.message.includes('401')) {
    // Handle authentication error
  } else if (error.message.includes('404')) {
    // Product not found
  } else {
    // Other errors
  }
}
```

## Best Practices

1. **Cache stock levels** - Don't fetch on every request
2. **Use real-time updates** - For live stock tracking
3. **Monitor low stock** - Set up alerts
4. **Track movements** - Keep audit trail
5. **Handle errors** - Graceful error handling

## Related Documentation

- [Products API](./products.md)
- [Stock Movements API](./stock-movements.md)

---

**Last Updated**: 2024
