# Categories API - Mobile

Complete guide to managing product categories from mobile applications.

## Overview

The Categories API allows you to:
- List categories
- Get category details
- Create categories
- Update categories
- Delete categories

## Endpoints

### List Categories

**Endpoint:** `GET /api/categories`

**Query Parameters:**
- `isActive` (boolean) - Filter by active status

**Example:**
```typescript
// Get all categories
const categories = await apiClient.request('/categories');

// Get only active categories
const activeCategories = await apiClient.request(
  '/categories?isActive=true'
);
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "category_id",
      "name": "Category Name",
      "description": "Category description",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get Category by ID

**Endpoint:** `GET /api/categories/:id`

**Example:**
```typescript
const category = await apiClient.request(`/categories/${categoryId}`);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "category_id",
    "name": "Category Name",
    "description": "Category description",
    "isActive": true,
    "productCount": 25,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Create Category

**Endpoint:** `POST /api/categories`

**Request:**
```json
{
  "name": "New Category",
  "description": "Category description",
  "isActive": true
}
```

**Example:**
```typescript
const newCategory = await apiClient.request('/categories', {
  method: 'POST',
  body: {
    name: 'New Category',
    description: 'Category description',
    isActive: true
  }
});
```

### Update Category

**Endpoint:** `PUT /api/categories/:id`

**Example:**
```typescript
const updated = await apiClient.request(`/categories/${categoryId}`, {
  method: 'PUT',
  body: {
    name: 'Updated Category Name',
    description: 'Updated description'
  }
});
```

### Delete Category

**Endpoint:** `DELETE /api/categories/:id`

**Example:**
```typescript
await apiClient.request(`/categories/${categoryId}`, {
  method: 'DELETE'
});
```

## Complete Example

```typescript
class CategoryService {
  constructor(private apiClient: APIClient) {}

  async getAllCategories(activeOnly = false) {
    const params = activeOnly ? '?isActive=true' : '';
    return this.apiClient.request(`/categories${params}`);
  }

  async getCategory(id: string) {
    return this.apiClient.request(`/categories/${id}`);
  }

  async createCategory(data: {
    name: string;
    description?: string;
    isActive?: boolean;
  }) {
    return this.apiClient.request('/categories', {
      method: 'POST',
      body: data
    });
  }

  async updateCategory(id: string, updates: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }) {
    return this.apiClient.request(`/categories/${id}`, {
      method: 'PUT',
      body: updates
    });
  }

  async deleteCategory(id: string) {
    return this.apiClient.request(`/categories/${id}`, {
      method: 'DELETE'
    });
  }
}
```

## Using Categories with Products

### Filter Products by Category

```typescript
// Get products in a category
const products = await apiClient.request(
  `/products?categoryId=${categoryId}`
);
```

### Get Category with Products

```typescript
// Get category
const category = await categoryService.getCategory(categoryId);

// Get products in category
const products = await productService.getProducts({
  categoryId: categoryId
});
```

## Error Handling

```typescript
try {
  const categories = await categoryService.getAllCategories();
} catch (error) {
  if (error.message.includes('401')) {
    // Handle authentication error
  } else if (error.message.includes('404')) {
    // Category not found
  } else {
    // Other errors
  }
}
```

## Best Practices

1. **Cache categories** - Categories don't change frequently
2. **Validate before create** - Check name uniqueness
3. **Handle dependencies** - Check products before delete
4. **Use active filter** - Only show active categories
5. **Organize hierarchically** - Use parent categories if needed

## Related Documentation

- [Products API](./products.md)

---

**Last Updated**: 2024
