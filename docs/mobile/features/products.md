# Products API - Mobile

Complete guide to managing products from mobile applications.

## Overview

The Products API allows you to:
- List and search products
- Get product details
- Create, update, and delete products
- Manage product variations
- Handle product images
- Track inventory

## Endpoints

### List Products

**Endpoint:** `GET /api/products`

**Query Parameters:**
- `search` (string) - Search by name, description, or SKU
- `categoryId` (string) - Filter by category
- `isActive` (boolean) - Filter by active status

**Example:**
```typescript
// Get all active products
const products = await apiClient.request('/products?isActive=true');

// Search products
const results = await apiClient.request('/products?search=laptop');

// Filter by category
const categoryProducts = await apiClient.request('/products?categoryId=cat123');
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "product_id",
      "name": "Product Name",
      "description": "Product description",
      "price": 99.99,
      "stock": 50,
      "sku": "SKU123",
      "categoryId": "category_id",
      "isActive": true,
      "variations": [],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get Product by ID

**Endpoint:** `GET /api/products/:id`

**Example:**
```typescript
const product = await apiClient.request(`/products/${productId}`);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "product_id",
    "name": "Product Name",
    "price": 99.99,
    "stock": 50,
    "categoryId": {
      "_id": "category_id",
      "name": "Category Name"
    },
    "variations": [
      {
        "size": "Large",
        "color": "Red",
        "price": 109.99,
        "stock": 25
      }
    ]
  }
}
```

### Create Product

**Endpoint:** `POST /api/products`

**Request:**
```json
{
  "name": "New Product",
  "description": "Product description",
  "price": 99.99,
  "stock": 50,
  "sku": "SKU123",
  "categoryId": "category_id",
  "isActive": true,
  "variations": [
    {
      "size": "Large",
      "color": "Red",
      "price": 109.99,
      "stock": 25
    }
  ]
}
```

**Example:**
```typescript
const newProduct = await apiClient.request('/products', {
  method: 'POST',
  body: {
    name: 'New Product',
    price: 99.99,
    stock: 50,
    categoryId: 'category_id',
    isActive: true
  }
});
```

### Update Product

**Endpoint:** `PUT /api/products/:id`

**Example:**
```typescript
const updated = await apiClient.request(`/products/${productId}`, {
  method: 'PUT',
  body: {
    name: 'Updated Name',
    price: 89.99
  }
});
```

### Delete Product

**Endpoint:** `DELETE /api/products/:id`

**Example:**
```typescript
await apiClient.request(`/products/${productId}`, {
  method: 'DELETE'
});
```

## Product Variations

Products can have variations (size, color, type) with different pricing and stock.

**Example with Variations:**
```typescript
const product = {
  name: "T-Shirt",
  basePrice: 29.99,
  variations: [
    {
      size: "Small",
      color: "Red",
      price: 29.99,
      stock: 10,
      sku: "TSHIRT-SM-RED"
    },
    {
      size: "Large",
      color: "Blue",
      price: 34.99,
      stock: 15,
      sku: "TSHIRT-LG-BLUE"
    }
  ]
};
```

## Stock Management

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

## Complete Example

```typescript
class ProductService {
  constructor(private apiClient: APIClient) {}

  async getAllProducts(filters?: {
    search?: string;
    categoryId?: string;
    isActive?: boolean;
  }) {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.isActive !== undefined) {
      params.append('isActive', String(filters.isActive));
    }

    const query = params.toString();
    return this.apiClient.request(`/products${query ? `?${query}` : ''}`);
  }

  async getProduct(id: string) {
    return this.apiClient.request(`/products/${id}`);
  }

  async createProduct(productData: any) {
    return this.apiClient.request('/products', {
      method: 'POST',
      body: productData
    });
  }

  async updateProduct(id: string, updates: any) {
    return this.apiClient.request(`/products/${id}`, {
      method: 'PUT',
      body: updates
    });
  }

  async deleteProduct(id: string) {
    return this.apiClient.request(`/products/${id}`, {
      method: 'DELETE'
    });
  }

  async refillStock(id: string, quantity: number, reason?: string) {
    return this.apiClient.request(`/products/${id}/refill`, {
      method: 'POST',
      body: { quantity, reason }
    });
  }
}
```

## Error Handling

```typescript
try {
  const products = await productService.getAllProducts();
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

1. **Cache product lists** - Products don't change frequently
2. **Implement search debouncing** - Reduce API calls
3. **Handle stock updates** - Show real-time stock levels
4. **Validate before create/update** - Check required fields
5. **Handle images** - Upload product images separately if needed

## Related Documentation

- [Categories API](./categories.md)
- [Inventory API](./inventory.md)
- [Transactions API](./transactions.md)
