# Mobile Client API Endpoints

Complete reference for client/customer authentication endpoints from a mobile app perspective.

---

## 🔐 Authentication Endpoints

### 1. Register Customer
**POST** `/api/auth/customer/register`

Register a new customer account with email and password.

**Request Body:**
```json
{
  "email": "customer@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",      // Optional
  "tenantSlug": "default"      // Optional - if not provided, tenantId will be null
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "customer": {
      "_id": "customer_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "customer@example.com",
      "phone": "+1234567890"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Response (Error - 400/409):**
```json
{
  "success": false,
  "error": "An account with this email already exists"
}
```

**Notes:**
- `tenantSlug` is **optional** for mobile apps
- If `tenantSlug` is not provided, customer will be registered with `tenantId = null`
- Token is valid for 30 days
- Cookie is automatically set (`customer-auth-token`)

---

### 2. Login Customer
**POST** `/api/auth/customer/login`

Login customer with email and password.

**Request Body:**
```json
{
  "email": "customer@example.com",
  "password": "securepassword123",
  "tenantSlug": "default"      // Optional - if not provided, searches across all tenants
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "customer": {
      "_id": "customer_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "customer@example.com",
      "phone": "+1234567890"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Response (Error - 401):**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

**Notes:**
- `tenantSlug` is **optional** for mobile apps
- If `tenantSlug` is not provided, system searches for customer by email across all tenants
- If customer found, uses their existing tenant
- Token is valid for 30 days
- Cookie is automatically set (`customer-auth-token`)

---

### 3. Send OTP
**POST** `/api/auth/customer/send-otp`

Send a 6-digit OTP to customer's phone number via SMS.

**Request Body:**
```json
{
  "phone": "+1234567890",
  "tenantSlug": "default"      // Optional - if not provided, finds from existing customer or uses default
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

**Response (Error - 429 - Rate Limited):**
```json
{
  "success": false,
  "error": "Please wait before requesting another OTP",
  "retryAfter": 60
}
```

**Notes:**
- `tenantSlug` is **optional** for mobile apps
- If `tenantSlug` is not provided:
  - First checks if customer exists with this phone number
  - Uses customer's tenant if found
  - Otherwise uses default tenant
- Rate limit: 1 OTP per minute per phone number
- OTP expires after 10 minutes
- In development, OTP is logged to console

---

### 4. Verify OTP & Login
**POST** `/api/auth/customer/verify-otp`

Verify OTP code and authenticate customer. Creates customer account if doesn't exist.

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456",
  "tenantSlug": "default",     // Optional - if not provided, finds from customer/OTP or uses default
  "firstName": "John",          // Required for new customers
  "lastName": "Doe"             // Required for new customers
}
```

**Response (Success - 200):**
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

**Response (Error - 401):**
```json
{
  "success": false,
  "error": "Invalid or expired OTP"
}
```

**Notes:**
- `tenantSlug` is **optional** for mobile apps
- If `tenantSlug` is not provided:
  - First checks if customer exists with this phone
  - If not found, checks for unverified OTP record
  - Uses default tenant if neither found
- Auto-creates customer account if new
- Maximum 5 verification attempts
- Token is valid for 30 days
- Cookie is automatically set (`customer-auth-token`)

---

### 5. Facebook Login
**POST** `/api/auth/customer/facebook`

Authenticate customer using Facebook access token.

**Request Body:**
```json
{
  "accessToken": "facebook_access_token",
  "tenantSlug": "default"       // Optional - if not provided, finds from existing customer or uses default
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "customer_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "facebookId": "facebook_user_id"
    }
  }
}
```

**Notes:**
- `tenantSlug` is **optional** for mobile apps
- If `tenantSlug` is not provided:
  - First tries to find customer by Facebook ID
  - If not found, tries by email
  - Uses default tenant if customer not found
- Auto-creates customer account if new
- Links Facebook ID to existing email account if found
- Token is valid for 30 days
- Cookie is automatically set (`customer-auth-token`)

---

### 6. Get Current Customer
**GET** `/api/auth/customer/me`

Get current authenticated customer profile.

**Headers:**
```
Authorization: Bearer {token}
```
OR
```
Cookie: customer-auth-token={token}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "customer": {
    "_id": "customer_id",
    "firstName": "John",
    "lastName": "Doe",
    "email": "customer@example.com",
    "phone": "+1234567890",
    "addresses": [],
    "dateOfBirth": null,
    "tags": [],
    "totalSpent": 500.00,
    "lastPurchaseDate": "2024-01-17T10:00:00Z",
    "lastLogin": "2024-01-17T10:00:00Z"
  }
}
```

**Response (Error - 401):**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Notes:**
- Requires authentication
- Returns full customer profile (password excluded)
- Includes purchase history summary

---

### 7. Logout Customer
**POST** `/api/auth/customer/logout`

Logout customer and clear authentication token.

**Headers:**
```
Authorization: Bearer {token}
```
OR
```
Cookie: customer-auth-token={token}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Notes:**
- Clears the `customer-auth-token` cookie
- Token is invalidated on client side (server doesn't maintain token blacklist)

---

## 📱 Mobile App Implementation Notes

### Authentication Flow

#### Option 1: Email/Password (Recommended for registered users)
```
1. Register: POST /api/auth/customer/register
   - tenantSlug is optional (can be null)
   
2. Login: POST /api/auth/customer/login
   - tenantSlug is optional (searches across tenants)
```

#### Option 2: Phone OTP (Recommended for quick access)
```
1. Send OTP: POST /api/auth/customer/send-otp
   - tenantSlug is optional
   
2. Verify OTP: POST /api/auth/customer/verify-otp
   - tenantSlug is optional
   - Auto-creates account if new
```

#### Option 3: Facebook (Social login)
```
1. Get Facebook access token from Facebook SDK
2. Login: POST /api/auth/customer/facebook
   - tenantSlug is optional
   - Auto-creates account if new
```

### Token Management

1. **Store Token Securely**
   - Use secure storage (e.g., Keychain on iOS, Keystore on Android)
   - Token expires after 30 days

2. **Include Token in Requests**
   - Add to Authorization header: `Authorization: Bearer {token}`
   - OR rely on cookie (if using same domain)

3. **Handle Token Expiry**
   - Check for 401 responses
   - Redirect to login screen
   - Optionally implement token refresh

### Tenant Handling for Mobile

**Key Points:**
- `tenantSlug` is **optional** for all customer endpoints
- If not provided:
  - **Register**: Creates customer with `tenantId = null`
  - **Login**: Searches customer by email across all tenants
  - **OTP**: Finds tenant from existing customer or OTP record
  - **Facebook**: Finds tenant from existing customer

**Best Practice:**
- Mobile apps can operate without knowing tenant upfront
- System automatically resolves tenant from customer data
- Customers can be tenantless (tenantId = null) for multi-tenant scenarios

---

## 🔒 Security Features

1. **Password Requirements**
   - Minimum 8 characters
   - Stored as bcrypt hash

2. **OTP Security**
   - 6-digit code
   - Expires after 10 minutes
   - Maximum 5 verification attempts
   - Rate limited: 1 per minute

3. **Token Security**
   - JWT tokens with 30-day expiry
   - HTTP-only cookies (web)
   - Bearer token authentication (mobile)

4. **Phone Normalization**
   - All phone numbers normalized (non-digits removed)
   - Stored in consistent format

---

## 📊 Response Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid input data |
| 401 | Unauthorized | Invalid credentials or missing token |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Email already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

---

## 🚨 Error Handling

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common Errors:**
- `"Email and password are required"` - Missing required fields
- `"Invalid email format"` - Email validation failed
- `"Invalid email or password"` - Wrong credentials
- `"An account with this email already exists"` - Duplicate email
- `"Invalid or expired OTP"` - OTP verification failed
- `"Please wait before requesting another OTP"` - Rate limit hit
- `"Unauthorized"` - Missing or invalid token

---

## 📝 Example Mobile Implementation

### React Native / Expo Example

```typescript
// api/client.ts
const API_BASE_URL = 'https://your-api-domain.com';

export const customerAPI = {
  register: async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string,
    tenantSlug?: string
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/customer/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName,
        lastName,
        phone,
        tenantSlug, // Optional
      }),
    });
    return response.json();
  },

  login: async (email: string, password: string, tenantSlug?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        tenantSlug, // Optional
      }),
    });
    return response.json();
  },

  sendOTP: async (phone: string, tenantSlug?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/customer/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        tenantSlug, // Optional
      }),
    });
    return response.json();
  },

  verifyOTP: async (
    phone: string,
    otp: string,
    firstName?: string,
    lastName?: string,
    tenantSlug?: string
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/customer/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        otp,
        firstName,
        lastName,
        tenantSlug, // Optional
      }),
    });
    return response.json();
  },

  getProfile: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/customer/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  },

  logout: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/customer/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  },
};
```

---

## 🔄 Migration Notes

**For Existing Mobile Apps:**
- All endpoints now support optional `tenantSlug`
- If your app was sending `tenantSlug`, it will continue to work
- If your app wasn't sending `tenantSlug`, it will now work without it
- Customers can now be registered with `tenantId = null`

---

**Last Updated**: 2024-01-17  
**Version**: 2.0  
**Changes**: Made `tenantSlug` optional for all customer endpoints to support mobile apps
