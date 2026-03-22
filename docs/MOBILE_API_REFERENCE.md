# Mobile API Reference

Complete reference documentation for all 1POS API endpoints accessible from mobile applications.

## Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

---

## Authentication Endpoints

### Login (Email/Password)

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "tenantSlug": "your-tenant-slug"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "user_id",
      "email": "user@example.com",
      "name": "User Name",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

### Login (PIN)

**Endpoint:** `POST /api/auth/login-pin`

**Request:**
```json
{
  "pin": "1234",
  "tenantSlug": "your-tenant-slug"
}
```

**Response:** Same as email/password login

---

### Login (QR Code)

**Endpoint:** `POST /api/auth/login-qr`

**Request:**
```json
{
  "qrToken": "qr_token_string",
  "tenantSlug": "your-tenant-slug"
}
```

**Response:** Same as email/password login

---

### Get Current User

**Endpoint:** `GET /api/auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "user": {
    "_id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin"
  }
}
```

---

### Get User Profile

**Endpoint:** `GET /api/auth/profile`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Update User Profile

**Endpoint:** `PUT /api/auth/profile`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Updated Name",
  "email": "newemail@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "user_id",
    "email": "newemail@example.com",
    "name": "Updated Name",
    "role": "admin"
  }
}
```

---

### Logout

**Endpoint:** `POST /api/auth/logout`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Product Endpoints

### List Products

**Endpoint:** `GET /api/products`

**Query Parameters:**
- `search` (string): Search products by name, description, or SKU
- `category` (string): Filter by category name
- `categoryId` (string): Filter by category ID
- `isActive` (boolean): Filter by active status

**Example:**
```
GET /api/products?search=laptop&categoryId=cat123&isActive=true
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

---

### Get Product by ID

**Endpoint:** `GET /api/products/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "product_id",
    "name": "Product Name",
    "description": "Product description",
    "price": 99.99,
    "stock": 50,
    "sku": "SKU123",
    "categoryId": {
      "_id": "category_id",
      "name": "Category Name"
    },
    "isActive": true,
    "variations": [],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Create Product

**Endpoint:** `POST /api/products`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "New Product",
  "description": "Product description",
  "price": 99.99,
  "stock": 50,
  "sku": "SKU123",
  "categoryId": "category_id",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "new_product_id",
    "name": "New Product",
    "price": 99.99,
    "stock": 50,
    "sku": "SKU123"
  }
}
```

---

### Update Product

**Endpoint:** `PUT /api/products/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:** Same format as create product

**Response:** Updated product object

---

### Delete Product

**Endpoint:** `DELETE /api/products/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Product deleted successfully"
}
```

---

## Transaction Endpoints

### List Transactions

**Endpoint:** `GET /api/transactions`

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 50)
- `status` (string): Filter by status (completed, cancelled, refunded)
- `startDate` (string): Filter by start date (ISO format)
- `endDate` (string): Filter by end date (ISO format)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "transaction_id",
      "receiptNumber": "REC-20240101-00001",
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
      "total": 21.98,
      "paymentMethod": "cash",
      "status": "completed",
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

---

### Get Transaction by ID

**Endpoint:** `GET /api/transactions/:id`

**Response:** Single transaction object

---

### Create Transaction

**Endpoint:** `POST /api/transactions`

**Headers:** `Authorization: Bearer <token>`

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

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "transaction_id",
    "receiptNumber": "REC-20240101-00001",
    "total": 19.78,
    "status": "completed"
  }
}
```

---

### Refund Transaction

**Endpoint:** `POST /api/transactions/:id/refund`

**Headers:** `Authorization: Bearer <token>`

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

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "refund_transaction_id",
    "originalTransactionId": "transaction_id",
    "total": 10.99,
    "status": "refunded"
  }
}
```

---

### Get Transaction Statistics

**Endpoint:** `GET /api/transactions/stats`

**Query Parameters:**
- `startDate` (string): Start date (ISO format)
- `endDate` (string): End date (ISO format)

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

---

## Category Endpoints

### List Categories

**Endpoint:** `GET /api/categories`

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

---

### Get Category by ID

**Endpoint:** `GET /api/categories/:id`

**Response:** Single category object

---

### Create Category

**Endpoint:** `POST /api/categories`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "New Category",
  "description": "Category description",
  "isActive": true
}
```

**Response:** Created category object

---

### Update Category

**Endpoint:** `PUT /api/categories/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:** Same format as create

**Response:** Updated category object

---

### Delete Category

**Endpoint:** `DELETE /api/categories/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Category deleted successfully"
}
```

---

## Bundle Endpoints

### List Bundles

**Endpoint:** `GET /api/bundles`

**Query Parameters:**
- `search` (string): Search bundles
- `isActive` (boolean): Filter by active status

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "bundle_id",
      "name": "Bundle Name",
      "description": "Bundle description",
      "price": 199.99,
      "items": [
        {
          "product": "product_id",
          "name": "Product Name",
          "quantity": 2
        }
      ],
      "isActive": true
    }
  ]
}
```

---

### Get Bundle by ID

**Endpoint:** `GET /api/bundles/:id`

**Response:** Single bundle object

---

### Create Bundle

**Endpoint:** `POST /api/bundles`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "New Bundle",
  "description": "Bundle description",
  "price": 199.99,
  "items": [
    {
      "product": "product_id",
      "quantity": 2
    }
  ],
  "isActive": true
}
```

**Response:** Created bundle object

---

### Update Bundle

**Endpoint:** `PUT /api/bundles/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:** Same format as create

**Response:** Updated bundle object

---

### Delete Bundle

**Endpoint:** `DELETE /api/bundles/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Bundle deleted successfully"
}
```

---

## Discount Endpoints

### List Discounts

**Endpoint:** `GET /api/discounts`

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
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validUntil": "2024-12-31T23:59:59.000Z",
      "usageLimit": 100,
      "usageCount": 50,
      "isActive": true
    }
  ]
}
```

---

### Validate Discount Code

**Endpoint:** `POST /api/discounts/validate`

**Request:**
```json
{
  "code": "DISCOUNT10",
  "amount": 100.00
}
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

---

## Attendance Endpoints

### List Attendance Records

**Endpoint:** `GET /api/attendance`

**Query Parameters:**
- `userId` (string): Filter by user ID
- `startDate` (string): Start date (ISO format)
- `endDate` (string): End date (ISO format)
- `limit` (number): Limit results

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "attendance_id",
      "userId": {
        "_id": "user_id",
        "name": "User Name"
      },
      "clockIn": "2024-01-01T09:00:00.000Z",
      "clockOut": "2024-01-01T17:00:00.000Z",
      "totalHours": 8.0,
      "createdAt": "2024-01-01T09:00:00.000Z"
    }
  ]
}
```

---

### Get Current Attendance Session

**Endpoint:** `GET /api/attendance/current`

**Query Parameters:**
- `userId` (string): User ID

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "attendance_id",
    "userId": "user_id",
    "clockIn": "2024-01-01T09:00:00.000Z",
    "status": "clocked-in"
  }
}
```

---

### Clock In/Out

**Endpoint:** `POST /api/attendance`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "action": "clock-in",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "123 Main St"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "attendance_id",
    "clockIn": "2024-01-01T09:00:00.000Z",
    "status": "clocked-in"
  }
}
```

---

## Cash Drawer Endpoints

### List Cash Drawer Sessions

**Endpoint:** `GET /api/cash-drawer/sessions`

**Query Parameters:**
- `status` (string): Filter by status (open, closed)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "session_id",
      "userId": {
        "_id": "user_id",
        "name": "User Name"
      },
      "openingAmount": 100.00,
      "closingAmount": 150.00,
      "expectedAmount": 145.00,
      "shortage": 0,
      "overage": 5.00,
      "openingTime": "2024-01-01T09:00:00.000Z",
      "closingTime": "2024-01-01T17:00:00.000Z",
      "status": "closed"
    }
  ]
}
```

---

## Report Endpoints

### Sales Report

**Endpoint:** `GET /api/reports/sales`

**Query Parameters:**
- `startDate` (string): Start date (ISO format)
- `endDate` (string): End date (ISO format)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSales": 10000.00,
    "totalTransactions": 150,
    "averageTransaction": 66.67,
    "salesByDay": [
      {
        "date": "2024-01-01",
        "sales": 1000.00,
        "transactions": 15
      }
    ]
  }
}
```

---

### Product Report

**Endpoint:** `GET /api/reports/products`

**Query Parameters:**
- `startDate` (string): Start date (ISO format)
- `endDate` (string): End date (ISO format)

**Response:**
```json
{
  "success": true,
  "data": {
    "topProducts": [
      {
        "product": "product_id",
        "name": "Product Name",
        "quantitySold": 100,
        "revenue": 1000.00
      }
    ]
  }
}
```

---

## Error Responses

All endpoints may return the following error responses:

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Validation error message"
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Not authenticated"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Rate Limiting

API requests are rate-limited to prevent abuse. If you exceed the rate limit, you'll receive:

**Status Code:** `429 Too Many Requests`

**Response:**
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

Wait for the specified number of seconds before retrying.

---

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 50, max: 100)

**Response includes pagination info:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 200,
    "pages": 4
  }
}
```
