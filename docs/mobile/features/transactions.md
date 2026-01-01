# Transactions API - Mobile

Complete guide to processing transactions from mobile applications.

## Overview

The Transactions API handles:
- Creating sales transactions
- Processing payments (cash, card, digital)
- Applying discounts
- Generating receipts
- Processing refunds
- Transaction history

## Endpoints

### Create Transaction

**Endpoint:** `POST /api/transactions`

**Request:**
```json
{
  "items": [
    {
      "product": "product_id",
      "name": "Product Name",
      "price": 10.99,
      "quantity": 2,
      "subtotal": 21.98
    }
  ],
  "subtotal": 21.98,
  "discountCode": "DISCOUNT10",
  "discountAmount": 2.20,
  "total": 19.78,
  "paymentMethod": "cash",
  "cashReceived": 25.00,
  "change": 5.22,
  "notes": "Customer notes"
}
```

**Example:**
```typescript
const transaction = await apiClient.request('/transactions', {
  method: 'POST',
  body: {
    items: [
      {
        product: 'product_id',
        name: 'Product Name',
        price: 10.99,
        quantity: 2,
        subtotal: 21.98
      }
    ],
    subtotal: 21.98,
    total: 21.98,
    paymentMethod: 'cash',
    cashReceived: 25.00,
    change: 5.22
  }
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "transaction_id",
    "receiptNumber": "REC-20240101-00001",
    "total": 19.78,
    "status": "completed",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Transactions

**Endpoint:** `GET /api/transactions`

**Query Parameters:**
- `page` (number) - Page number
- `limit` (number) - Items per page
- `status` (string) - Filter by status
- `startDate` (string) - Start date filter
- `endDate` (string) - End date filter

**Example:**
```typescript
const transactions = await apiClient.request(
  '/transactions?page=1&limit=50&status=completed'
);
```

### Get Transaction by ID

**Endpoint:** `GET /api/transactions/:id`

**Example:**
```typescript
const transaction = await apiClient.request(`/transactions/${transactionId}`);
```

### Refund Transaction

**Endpoint:** `POST /api/transactions/:id/refund`

**Request:**
```json
{
  "items": [
    {
      "product": "product_id",
      "quantity": 1
    }
  ],
  "reason": "Customer request",
  "partial": true
}
```

**Example:**
```typescript
const refund = await apiClient.request(`/transactions/${transactionId}/refund`, {
  method: 'POST',
  body: {
    items: [{ product: 'product_id', quantity: 1 }],
    reason: 'Customer request',
    partial: true
  }
});
```

### Get Transaction Statistics

**Endpoint:** `GET /api/transactions/stats`

**Query Parameters:**
- `startDate` (string) - Start date
- `endDate` (string) - End date

**Example:**
```typescript
const stats = await apiClient.request(
  '/transactions/stats?startDate=2024-01-01&endDate=2024-01-31'
);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSales": 10000.00,
    "totalTransactions": 150,
    "averageTransaction": 66.67,
    "totalRefunds": 200.00,
    "netSales": 9800.00
  }
}
```

## Payment Methods

### Cash Payment
```typescript
{
  paymentMethod: 'cash',
  cashReceived: 25.00,
  change: 5.22  // Calculated: cashReceived - total
}
```

### Card Payment
```typescript
{
  paymentMethod: 'card',
  // No cashReceived or change needed
}
```

### Digital Payment
```typescript
{
  paymentMethod: 'digital',
  // No cashReceived or change needed
}
```

## Discount Application

### Validate Discount First
```typescript
// Validate discount before creating transaction
const validation = await apiClient.request('/discounts/validate', {
  method: 'POST',
  body: {
    code: 'DISCOUNT10',
    amount: 100.00
  }
});

if (validation.data.valid) {
  // Use discount in transaction
  const transaction = await apiClient.request('/transactions', {
    method: 'POST',
    body: {
      // ... transaction data
      discountCode: 'DISCOUNT10',
      discountAmount: validation.data.discount.discountAmount
    }
  });
}
```

## Complete Example

```typescript
class TransactionService {
  constructor(private apiClient: APIClient) {}

  async createTransaction(data: {
    items: Array<{
      product: string;
      name: string;
      price: number;
      quantity: number;
      subtotal: number;
    }>;
    paymentMethod: 'cash' | 'card' | 'digital';
    cashReceived?: number;
    discountCode?: string;
    notes?: string;
  }) {
    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Apply discount if provided
    let discountAmount = 0;
    if (data.discountCode) {
      const validation = await this.apiClient.request('/discounts/validate', {
        method: 'POST',
        body: {
          code: data.discountCode,
          amount: subtotal
        }
      });
      
      if (validation.data.valid) {
        discountAmount = validation.data.discount.discountAmount;
      }
    }
    
    const total = subtotal - discountAmount;
    
    // Calculate change for cash payments
    let change = 0;
    if (data.paymentMethod === 'cash' && data.cashReceived) {
      change = data.cashReceived - total;
    }
    
    return this.apiClient.request('/transactions', {
      method: 'POST',
      body: {
        ...data,
        subtotal,
        discountAmount,
        total,
        change
      }
    });
  }

  async getTransactions(filters?: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    return this.apiClient.request(`/transactions?${params.toString()}`);
  }

  async refundTransaction(transactionId: string, items: Array<{
    product: string;
    quantity: number;
  }>, reason?: string) {
    return this.apiClient.request(`/transactions/${transactionId}/refund`, {
      method: 'POST',
      body: {
        items,
        reason,
        partial: items.length > 0
      }
    });
  }
}
```

## Error Handling

```typescript
try {
  const transaction = await transactionService.createTransaction({
    items: [...],
    paymentMethod: 'cash',
    cashReceived: 25.00
  });
} catch (error) {
  if (error.message.includes('Insufficient stock')) {
    // Handle stock error
  } else if (error.message.includes('Invalid discount')) {
    // Handle discount error
  } else {
    // Handle other errors
  }
}
```

## Best Practices

1. **Validate stock before transaction** - Check product availability
2. **Calculate totals client-side** - Verify server calculations
3. **Handle payment methods** - Different logic for cash/card/digital
4. **Store transaction locally** - For offline support
5. **Handle refunds carefully** - Restore stock correctly

## Related Documentation

- [Products API](./products.md)
- [Discounts API](./discounts.md)
- [Inventory API](./inventory.md)
