# Discounts API - Mobile

Complete guide to managing discounts and promotions from mobile applications.

## Overview

The Discounts API allows you to:
- List discount codes
- Validate discount codes
- Get discount details
- Create discounts
- Update discounts
- Track discount usage

## Endpoints

### List Discounts

**Endpoint:** `GET /api/discounts`

**Query Parameters:**
- `isActive` (boolean) - Filter by active status
- `code` (string) - Search by code

**Example:**
```typescript
// Get all discounts
const discounts = await apiClient.request('/discounts');

// Get only active discounts
const activeDiscounts = await apiClient.request(
  '/discounts?isActive=true'
);
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "discount_id",
      "code": "DISCOUNT10",
      "name": "10% Off",
      "type": "percentage",
      "value": 10,
      "minPurchaseAmount": 50,
      "maxDiscountAmount": 20,
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validUntil": "2024-12-31T23:59:59.000Z",
      "usageLimit": 100,
      "usageCount": 50,
      "isActive": true
    }
  ]
}
```

### Validate Discount Code

**Endpoint:** `POST /api/discounts/validate`

**Request:**
```json
{
  "code": "DISCOUNT10",
  "amount": 100.00
}
```

**Example:**
```typescript
const validation = await apiClient.request('/discounts/validate', {
  method: 'POST',
  body: {
    code: 'DISCOUNT10',
    amount: 100.00
  }
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "discount": {
      "_id": "discount_id",
      "code": "DISCOUNT10",
      "type": "percentage",
      "value": 10,
      "discountAmount": 10.00,
      "finalAmount": 90.00
    }
  }
}
```

**Error Response (Invalid):**
```json
{
  "success": false,
  "error": "Discount code is invalid or expired"
}
```

### Get Discount by ID

**Endpoint:** `GET /api/discounts/:id`

**Example:**
```typescript
const discount = await apiClient.request(`/discounts/${discountId}`);
```

### Create Discount

**Endpoint:** `POST /api/discounts`

**Request:**
```json
{
  "code": "NEWCODE",
  "name": "New Discount",
  "type": "percentage",
  "value": 15,
  "minPurchaseAmount": 100,
  "maxDiscountAmount": 50,
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validUntil": "2024-12-31T23:59:59.000Z",
  "usageLimit": 200,
  "isActive": true
}
```

**Example:**
```typescript
const newDiscount = await apiClient.request('/discounts', {
  method: 'POST',
  body: {
    code: 'NEWCODE',
    name: 'New Discount',
    type: 'percentage',
    value: 15,
    minPurchaseAmount: 100,
    validFrom: '2024-01-01T00:00:00.000Z',
    validUntil: '2024-12-31T23:59:59.000Z',
    isActive: true
  }
});
```

### Update Discount

**Endpoint:** `PUT /api/discounts/:id`

**Example:**
```typescript
const updated = await apiClient.request(`/discounts/${discountId}`, {
  method: 'PUT',
  body: {
    isActive: false  // Deactivate discount
  }
});
```

### Delete Discount

**Endpoint:** `DELETE /api/discounts/:id`

**Example:**
```typescript
await apiClient.request(`/discounts/${discountId}`, {
  method: 'DELETE'
});
```

## Discount Types

### Percentage Discount

```typescript
{
  type: 'percentage',
  value: 10,  // 10% off
  // Calculates: amount * (value / 100)
}
```

### Fixed Amount Discount

```typescript
{
  type: 'fixed',
  value: 5.00,  // $5.00 off
  // Deducts fixed amount
}
```

## Discount Validation Flow

### Before Transaction

```typescript
async function validateAndApplyDiscount(code: string, amount: number) {
  // Validate discount
  const validation = await apiClient.request('/discounts/validate', {
    method: 'POST',
    body: { code, amount }
  });

  if (validation.data.valid) {
    const discount = validation.data.discount;
    return {
      code: discount.code,
      discountAmount: discount.discountAmount,
      finalAmount: discount.finalAmount
    };
  }

  throw new Error('Invalid discount code');
}

// Use in transaction
try {
  const discount = await validateAndApplyDiscount('DISCOUNT10', 100.00);
  // discount.discountAmount = 10.00
  // discount.finalAmount = 90.00
} catch (error) {
  // Handle invalid discount
}
```

## Complete Example

```typescript
class DiscountService {
  constructor(private apiClient: APIClient) {}

  async getAllDiscounts(activeOnly = false) {
    const params = activeOnly ? '?isActive=true' : '';
    return this.apiClient.request(`/discounts${params}`);
  }

  async validateDiscount(code: string, amount: number) {
    return this.apiClient.request('/discounts/validate', {
      method: 'POST',
      body: { code, amount }
    });
  }

  async getDiscount(id: string) {
    return this.apiClient.request(`/discounts/${id}`);
  }

  async createDiscount(data: {
    code: string;
    name?: string;
    type: 'percentage' | 'fixed';
    value: number;
    minPurchaseAmount?: number;
    maxDiscountAmount?: number;
    validFrom: string;
    validUntil: string;
    usageLimit?: number;
    isActive?: boolean;
  }) {
    return this.apiClient.request('/discounts', {
      method: 'POST',
      body: data
    });
  }

  async updateDiscount(id: string, updates: any) {
    return this.apiClient.request(`/discounts/${id}`, {
      method: 'PUT',
      body: updates
    });
  }

  async deleteDiscount(id: string) {
    return this.apiClient.request(`/discounts/${id}`, {
      method: 'DELETE'
    });
  }
}
```

## Using Discounts in Transactions

### Apply Discount to Transaction

```typescript
async function createTransactionWithDiscount(
  items: any[],
  discountCode: string
) {
  // Calculate subtotal
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Validate discount
  let discountAmount = 0;
  try {
    const validation = await discountService.validateDiscount(
      discountCode,
      subtotal
    );
    if (validation.data.valid) {
      discountAmount = validation.data.discount.discountAmount;
    }
  } catch (error) {
    // Discount invalid, proceed without discount
  }

  const total = subtotal - discountAmount;

  // Create transaction
  return transactionService.createTransaction({
    items,
    subtotal,
    discountCode: discountAmount > 0 ? discountCode : undefined,
    discountAmount,
    total,
    paymentMethod: 'cash'
  });
}
```

## Error Handling

```typescript
try {
  const validation = await discountService.validateDiscount('CODE', 100);
} catch (error) {
  if (error.message.includes('expired')) {
    // Discount expired
  } else if (error.message.includes('minimum')) {
    // Minimum purchase not met
  } else if (error.message.includes('limit')) {
    // Usage limit reached
  } else {
    // Other errors
  }
}
```

## Best Practices

1. **Validate before use** - Always validate discount codes
2. **Check expiration** - Verify discount is still valid
3. **Handle errors gracefully** - Don't block transaction on invalid discount
4. **Track usage** - Monitor discount usage
5. **Set limits** - Use usage limits to prevent abuse

## Related Documentation

- [Transactions API](./transactions.md)

---

**Last Updated**: 2024
