# Customer API Endpoints Summary

This document summarizes all customer-facing API endpoints for the mobile application.

---

## Authentication Endpoints

### Send OTP
**POST** `/api/auth/customer/send-otp`

Send a 6-digit OTP to customer's phone number via Twilio SMS.

**Request:**
```json
{
  "phone": "+1234567890",
  "tenantSlug": "default"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

**Rate Limits:**
- 1 OTP per minute per phone number
- OTP expires after 10 minutes

---

### Verify OTP & Login
**POST** `/api/auth/customer/verify-otp`

Verify OTP code and authenticate customer. Creates customer account if doesn't exist.

**Request:**
```json
{
  "phone": "+1234567890",
  "otp": "123456",
  "tenantSlug": "default",
  "firstName": "John",  // Required for new customers
  "lastName": "Doe"     // Required for new customers
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "customer": {
      "_id": "customer_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Features:**
- Returns JWT token (30-day expiry)
- Sets HTTP-only cookie
- Auto-creates customer account if new
- Links by phone number

---

## Booking Endpoints

### Get Customer Bookings
**GET** `/api/bookings/customer/{customerId}`

Get all bookings for authenticated customer.

**Headers:**
```
Authorization: Bearer {token}
```

**Query Parameters:**
- `status` (optional): Filter by status (pending, confirmed, completed, cancelled)
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "booking_id",
      "customerName": "John Doe",
      "serviceName": "Haircut",
      "startTime": "2024-01-17T10:00:00Z",
      "endTime": "2024-01-17T10:30:00Z",
      "duration": 30,
      "status": "confirmed",
      "staffName": "John Smith"
    }
  ]
}
```

**Security:**
- Customer can only access their own bookings
- Validates customer ID matches authenticated customer

---

### Create Booking
**POST** `/api/bookings`

Create a new booking. Works for both customers and staff.

**Headers:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "serviceName": "Haircut",
  "startTime": "2024-01-17T10:00:00Z",
  "duration": 30,
  "staffId": "staff_id",  // Optional
  "notes": "Special requests"
}
```

**Note:** If authenticated as customer, `customerName`, `customerEmail`, and `customerPhone` are auto-filled from customer profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "booking_id",
    "customerName": "John Doe",
    "serviceName": "Haircut",
    "startTime": "2024-01-17T10:00:00Z",
    "status": "pending"
  }
}
```

---

### Get Available Time Slots
**GET** `/api/bookings/time-slots`

Get available booking time slots for a specific date.

**Query Parameters:**
- `date` (required): ISO date string
- `duration` (optional, default: 60): Duration in minutes
- `staffId` (optional): Filter by staff member
- `slotInterval` (optional, default: 30): Interval between slots
- `startHour` (optional, default: 9): Start hour
- `endHour` (optional, default: 17): End hour

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2024-01-17",
    "slots": [
      "09:00",
      "09:30",
      "10:00",
      "10:30"
    ]
  }
}
```

---

## Transaction/Order Endpoints

### Get Customer Orders
**GET** `/api/transactions/customer/{customerId}`

Get all orders/transactions for authenticated customer.

**Headers:**
```
Authorization: Bearer {token}
```

**Query Parameters:**
- `status` (optional): Filter by status (completed, cancelled, refunded)
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20): Items per page

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "transaction_id",
      "receiptNumber": "REC-20240117-00001",
      "items": [
        {
          "product": "product_id",
          "name": "Product Name",
          "price": 25.00,
          "quantity": 2,
          "subtotal": 50.00
        }
      ],
      "total": 50.00,
      "status": "completed",
      "createdAt": "2024-01-17T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

**Security:**
- Customer can only access their own orders
- Validates customer ID matches authenticated customer

---

### Create Order
**POST** `/api/transactions`

Create a new order/transaction.

**Headers:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "items": [
    {
      "product": "product_id",
      "name": "Product Name",
      "price": 25.00,
      "quantity": 2,
      "subtotal": 50.00
    }
  ],
  "subtotal": 50.00,
  "discountCode": "DISCOUNT10",
  "discountAmount": 5.00,
  "tax": 4.50,
  "total": 49.50,
  "paymentMethod": "cash",
  "notes": "Customer notes"
}
```

**Note:** If authenticated as customer, `customerEmail` and `customerPhone` are auto-filled from customer profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "transaction_id",
    "receiptNumber": "REC-20240117-00001",
    "total": 49.50,
    "status": "completed"
  }
}
```

---

## Customer Profile Endpoints

### Get Customer Profile
**GET** `/api/customers/{customerId}`

Get customer profile information.

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "customer_id",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "addresses": [],
    "totalSpent": 500.00,
    "lastPurchaseDate": "2024-01-17T10:00:00Z"
  }
}
```

---

### Update Customer Profile
**PUT** `/api/customers/{customerId}`

Update customer profile information.

**Headers:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "addresses": [
    {
      "street": "123 Main St",
      "city": "City",
      "state": "State",
      "zipCode": "12345",
      "country": "USA",
      "isDefault": true
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "customer_id",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}
```

---

## Product Endpoints (Public)

### Get Products
**GET** `/api/products`

Get list of products. No authentication required.

**Query Parameters:**
- `tenantSlug` (required): Tenant slug
- `search` (optional): Search by name, description, SKU
- `categoryId` (optional): Filter by category
- `isActive` (optional, default: true): Filter by active status

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "product_id",
      "name": "Product Name",
      "description": "Product description",
      "price": 25.00,
      "stock": 50,
      "image": "image_url",
      "isActive": true
    }
  ]
}
```

---

## Discount Endpoints

### Validate Discount Code
**POST** `/api/discounts/validate`

Validate and calculate discount for a discount code.

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
  "error": "Unauthorized"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "Forbidden: Insufficient permissions"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Resource not found"
}
```

**429 Too Many Requests:**
```json
{
  "success": false,
  "error": "Please wait before requesting another OTP",
  "retryAfter": 60
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

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer {your-jwt-token}
```

Tokens are obtained from the `/api/auth/customer/verify-otp` endpoint and are valid for 30 days.

---

## Rate Limiting

- **OTP Requests**: 1 per minute per phone number
- **API Requests**: Standard rate limiting applies (check response headers)

---

## Security Notes

1. **Customer Isolation**: Customers can only access their own data
2. **Token Expiry**: Tokens expire after 30 days
3. **OTP Expiry**: OTPs expire after 10 minutes
4. **Attempt Limiting**: Maximum 5 OTP verification attempts
5. **Phone Normalization**: Phone numbers are normalized (non-digits removed)

---

**Last Updated**: 2024
**Version**: 1.0
