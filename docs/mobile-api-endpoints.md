# Mobile API Endpoints

All requests use `Content-Type: application/json`.  
Authenticated endpoints require `Authorization: Bearer <token>` in the request header.  
Base URL (local dev): `http://localhost:3000`

---

## Authentication

### POST `/api/auth/mobile-login`
Login and receive a JWT in the response body (mobile-safe — no httpOnly cookie).

**Auth:** No (public pre-login route)

**Rate limit:** 10 requests / 15 min per IP

**Request body:**
```json
{
  "email": "admin@store.com",
  "password": "secret",
  "tenantSlug": "my-store"
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "access_token": "<jwt>",
    "user": {
      "id": "...",
      "email": "admin@store.com",
      "name": "Randy",
      "role": "admin"
    },
    "tenant": {
      "id": "...",
      "name": "My Store",
      "slug": "my-store"
    }
  }
}
```

**Allowed roles:** `owner`, `admin`, `manager`, `super_admin`  
**Error `403`** — cashier / viewer accounts are blocked.

---

## Stores

### GET `/api/stores`
Returns branches for a tenant. Works in two modes:

| Mode | When to use |
|------|-------------|
| Pre-login | `?slug=<tenantSlug>` — no token needed |
| Post-login | `Authorization: Bearer <token>` |

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "id": "...",
        "name": "Main Branch",
        "tenantId": "...",
        "branchId": "...",
        "address": "123 St, City"
      }
    ]
  }
}
```

---

### GET `/api/stores/retail`
Lists all active **retail** and **general** stores. No auth required — used for the pre-login store picker.

**Rate limit:** 30 requests / min per IP

**Query params:**

| Param | Default | Notes |
|-------|---------|-------|
| `search` | — | Filter by store name (case-insensitive) |
| `page` | `1` | 1-based |
| `limit` | `50` | Max `100` |

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "id": "...",
        "name": "My Retail Store",
        "slug": "my-retail-store",
        "businessType": "retail",
        "logo": null,
        "phone": "+63...",
        "address": "123 St, City",
        "branches": [
          {
            "id": "...",
            "branchId": "...",
            "tenantId": "...",
            "name": "Main Branch",
            "address": "123 St, City"
          }
        ]
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

---

## Products

### GET `/api/products`
Fetch the product list for the authenticated tenant.

**Auth:** Required

**Query params:**

| Param | Default | Notes |
|-------|---------|-------|
| `search` | — | Search name, description, SKU, barcode |
| `category` | — | Filter by category name |
| `categoryId` | — | Filter by category ID |
| `isActive` | `true` | `true` / `false` / `all` |
| `filter` | — | `missing-barcode` or `missing-image` |
| `page` | — | Required with `limit` for pagination |
| `limit` | — | Max `100` |

**Response `200`:**
```json
{
  "success": true,
  "data": [ /* product objects */ ],
  "pagination": { "total": 80, "page": 1, "limit": 20, "pages": 4 }
}
```

---

### GET `/api/products/by-barcode?code=<value>`
Look up a single product by barcode or SKU (case-insensitive).

**Auth:** Required

**Query params:**

| Param | Required | Notes |
|-------|----------|-------|
| `code` | Yes | Barcode or SKU value |

**Response `200`:**
```json
{ "success": true, "data": { "product": { /* product object */ } } }
```

**Response `404`:**
```json
{ "success": false, "error": "NOT_FOUND", "data": null }
```

---

### GET `/api/products/scan-session`
Initialize a bulk-scan session — returns all product IDs matching the filter.

**Auth:** Required

**Query params:**

| Param | Default | Notes |
|-------|---------|-------|
| `filter` | `missing-barcode` | `all` / `missing-barcode` / `missing-image` |

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "productIds": ["id1", "id2"],
    "total": 2,
    "filter": "missing-barcode"
  }
}
```

---

### PATCH `/api/products/:id/scan-update`
Save one product's scan data during a bulk-scan session.

**Auth:** Required

**URL param:** `:id` — MongoDB product `_id`

**Request body:**
```json
{
  "barcode": "1234567890",
  "name": "Product Name",
  "sku": "SKU-OPTIONAL",
  "price": 99.00,
  "stock": 10,
  "categoryId": "...",
  "image": "https://...",
  "notes": "optional notes",
  "sessionId": "sess_abc123"
}
```

All fields are optional except `sessionId`. If `sku` is omitted, one is auto-generated (`SKU-XXXXXXXX`).

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "product": { /* updated product */ },
    "skuGenerated": true
  }
}
```

**Error `409`** — SKU already in use by another product.

---

### POST `/api/products/scan-session/log`
Log session completion stats to the audit log.

**Auth:** Required

**Request body:**
```json
{
  "sessionId": "sess_abc123",
  "stats": {
    "done": 15,
    "skipped": 2,
    "errors": 0
  }
}
```

**Response `200`:**
```json
{ "success": true }
```

---

## Categories

### GET `/api/categories`
Returns all categories for the authenticated tenant.

**Auth:** Required

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "_id": "...", "name": "Beverages" }
  ]
}
```

---

## Upload

### POST `/api/upload`
Upload a product image (multipart/form-data).

**Auth:** Required  
**Content-Type:** `multipart/form-data`

**Form fields:**

| Field | Notes |
|-------|-------|
| `file` | Image file (JPEG / PNG / WEBP) |

**Response `200`:**
```json
{
  "success": true,
  "url": "https://cdn.example.com/uploads/image.jpg"
}
```

---

## Summary Table

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/mobile-login` | No | Login — returns JWT in body |
| GET | `/api/stores` | Optional | Branches for a tenant |
| GET | `/api/stores/retail` | No | All retail/general stores |
| GET | `/api/products` | Yes | Product list with search/filter |
| GET | `/api/products/by-barcode` | Yes | Lookup product by barcode/SKU |
| GET | `/api/products/scan-session` | Yes | Start bulk-scan session |
| PATCH | `/api/products/:id/scan-update` | Yes | Save scanned product data |
| POST | `/api/products/scan-session/log` | Yes | Log session completion |
| GET | `/api/categories` | Yes | Category list |
| POST | `/api/upload` | Yes | Upload product image |
