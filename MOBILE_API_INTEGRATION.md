# Mobile App API Integration Guide

This guide explains how to integrate the LocalPro POS API endpoints with mobile applications (iOS, Android, React Native, Flutter, etc.).

## Table of Contents
1. [API Base URL](#api-base-url)
2. [Authentication](#authentication)
3. [CORS Configuration](#cors-configuration)
4. [API Endpoints](#api-endpoints)
5. [Request/Response Format](#requestresponse-format)
6. [Error Handling](#error-handling)
7. [Code Examples](#code-examples)
8. [Best Practices](#best-practices)

---

## API Base URL

The API base URL depends on your deployment:

- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.com/api`

### Multi-Tenant URLs

Since this is a multi-tenant application, you may need to include the tenant slug in some requests:

```
POST /api/auth/login
Body: { email, password, tenantSlug }
```

---

## Authentication

The API uses **JWT (JSON Web Tokens)** for authentication. The authentication flow is:

### 1. Login

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "tenantSlug": "your-tenant-slug"
}
```

**Response**:
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

### 2. Alternative Login Methods

**PIN Login**: `POST /api/auth/login-pin`
```json
{
  "pin": "1234",
  "tenantSlug": "your-tenant-slug"
}
```

**QR Code Login**: `POST /api/auth/login-qr`
```json
{
  "qrToken": "qr_token_string",
  "tenantSlug": "your-tenant-slug"
}
```

### 3. Using the Token

After login, store the token securely (use secure storage like Keychain on iOS or Keystore on Android).

Include the token in all subsequent API requests using the `Authorization` header:

```
Authorization: Bearer <your-token>
```

### 4. Token Expiration

- Default expiration: **7 days**
- Check token validity: `GET /api/auth/me`
- Refresh: Re-login when token expires

### 5. Logout

**Endpoint**: `POST /api/auth/logout`

**Headers**:
```
Authorization: Bearer <your-token>
```

---

## CORS Configuration

To enable mobile app access, you need to configure CORS in your Next.js application.

### Update `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply CORS to all API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' }, // In production, specify your mobile app domains
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### Production CORS Settings

For production, replace `'*'` with specific origins:

```typescript
{ 
  key: 'Access-Control-Allow-Origin', 
  value: process.env.NODE_ENV === 'production' 
    ? 'https://your-mobile-app-domain.com' 
    : '*' 
}
```

---

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/login-pin` | PIN-based login |
| POST | `/api/auth/login-qr` | QR code login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/profile` | Get user profile |
| PUT | `/api/auth/profile` | Update user profile |
| POST | `/api/auth/logout` | Logout |

### Product Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products |
| GET | `/api/products/:id` | Get product details |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |

### Transaction Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions |
| GET | `/api/transactions/:id` | Get transaction details |
| POST | `/api/transactions` | Create transaction |
| POST | `/api/transactions/:id/refund` | Refund transaction |
| GET | `/api/transactions/stats` | Get transaction statistics |

### Category Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List categories |
| GET | `/api/categories/:id` | Get category details |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |

### Bundle Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bundles` | List bundles |
| GET | `/api/bundles/:id` | Get bundle details |
| POST | `/api/bundles` | Create bundle |
| PUT | `/api/bundles/:id` | Update bundle |
| DELETE | `/api/bundles/:id` | Delete bundle |

### Discount Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/discounts` | List discounts |
| GET | `/api/discounts/:id` | Get discount details |
| POST | `/api/discounts` | Create discount |
| PUT | `/api/discounts/:id` | Update discount |
| DELETE | `/api/discounts/:id` | Delete discount |
| POST | `/api/discounts/validate` | Validate discount code |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Get user details |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### Attendance Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance` | List attendance records |
| GET | `/api/attendance/current` | Get current attendance session |
| POST | `/api/attendance` | Clock in/out |

### Cash Drawer Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cash-drawer/sessions` | List cash drawer sessions |
| POST | `/api/cash-drawer/sessions` | Open/close cash drawer |

### Report Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/sales` | Sales report |
| GET | `/api/reports/products` | Product report |
| GET | `/api/reports/profit-loss` | Profit & loss report |
| GET | `/api/reports/cash-drawer` | Cash drawer report |
| GET | `/api/reports/vat` | VAT report |

---

## Request/Response Format

### Standard Request Format

All requests should include:
- **Content-Type**: `application/json`
- **Authorization**: `Bearer <token>` (for authenticated endpoints)

### Standard Response Format

All responses follow this structure:

**Success Response**:
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Error Handling

### Common Error Scenarios

1. **401 Unauthorized**: Token expired or invalid
   - Solution: Re-authenticate and get a new token

2. **403 Forbidden**: User doesn't have required permissions
   - Solution: Check user role/permissions

3. **400 Bad Request**: Invalid request data
   - Solution: Validate request body before sending

4. **404 Not Found**: Resource doesn't exist
   - Solution: Verify resource ID

5. **500 Internal Server Error**: Server-side error
   - Solution: Log error and retry if appropriate

### Error Handling Example

```typescript
try {
  const response = await fetch(`${API_BASE_URL}/api/products`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, redirect to login
      handleLogout();
    } else {
      throw new Error(data.error || 'Request failed');
    }
  }

  return data;
} catch (error) {
  console.error('API Error:', error);
  throw error;
}
```

---

## Code Examples

### React Native Example

```typescript
// api/client.ts
const API_BASE_URL = 'https://your-domain.com/api';

class APIClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        // Handle token expiration
        this.token = null;
        throw new Error('Unauthorized');
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Authentication
  async login(email: string, password: string, tenantSlug: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
    });
    
    if (response.success && response.data.token) {
      this.setToken(response.data.token);
      // Store token securely
      await SecureStore.setItemAsync('auth_token', response.data.token);
    }
    
    return response;
  }

  // Products
  async getProducts() {
    return this.request('/products');
  }

  async createProduct(productData: any) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
  }

  // Transactions
  async createTransaction(transactionData: any) {
    return this.request('/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }
}

export default new APIClient();
```

### Flutter/Dart Example

```dart
// api_client.dart
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class APIClient {
  static const String baseUrl = 'https://your-domain.com/api';
  final FlutterSecureStorage _storage = FlutterSecureStorage();
  String? _token;

  Future<void> setToken(String token) async {
    _token = token;
    await _storage.write(key: 'auth_token', value: token);
  }

  Future<String?> getToken() async {
    if (_token == null) {
      _token = await _storage.read(key: 'auth_token');
    }
    return _token;
  }

  Future<Map<String, dynamic>> request(
    String endpoint, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final token = await getToken();
    final url = Uri.parse('$baseUrl$endpoint');
    
    final headers = {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    http.Response response;
    
    switch (method) {
      case 'GET':
        response = await http.get(url, headers: headers);
        break;
      case 'POST':
        response = await http.post(
          url,
          headers: headers,
          body: body != null ? jsonEncode(body) : null,
        );
        break;
      case 'PUT':
        response = await http.put(
          url,
          headers: headers,
          body: body != null ? jsonEncode(body) : null,
        );
        break;
      case 'DELETE':
        response = await http.delete(url, headers: headers);
        break;
      default:
        throw Exception('Unsupported method: $method');
    }

    final data = jsonDecode(response.body);

    if (response.statusCode == 401) {
      await _storage.delete(key: 'auth_token');
      _token = null;
      throw Exception('Unauthorized');
    }

    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Request failed');
    }

    return data;
  }

  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String tenantSlug,
  ) async {
    final response = await request(
      '/auth/login',
      method: 'POST',
      body: {
        'email': email,
        'password': password,
        'tenantSlug': tenantSlug,
      },
    );

    if (response['success'] == true && response['data']?['token'] != null) {
      await setToken(response['data']['token']);
    }

    return response;
  }

  Future<Map<String, dynamic>> getProducts() async {
    return await request('/products');
  }

  Future<Map<String, dynamic>> createTransaction(
    Map<String, dynamic> transactionData,
  ) async {
    return await request(
      '/transactions',
      method: 'POST',
      body: transactionData,
    );
  }
}
```

### Swift (iOS) Example

```swift
// APIClient.swift
import Foundation

class APIClient {
    static let shared = APIClient()
    private let baseURL = "https://your-domain.com/api"
    private var token: String?
    
    private init() {
        loadToken()
    }
    
    private func loadToken() {
        token = KeychainHelper.shared.getToken()
    }
    
    func setToken(_ token: String) {
        self.token = token
        KeychainHelper.shared.saveToken(token)
    }
    
    func request(
        endpoint: String,
        method: String = "GET",
        body: [String: Any]? = nil
    ) async throws -> [String: Any] {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        if httpResponse.statusCode == 401 {
            token = nil
            KeychainHelper.shared.deleteToken()
            throw APIError.unauthorized
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            if let errorData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorData["error"] as? String {
                throw APIError.serverError(error)
            }
            throw APIError.requestFailed
        }
        
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError.invalidResponse
        }
        
        return json
    }
    
    func login(email: String, password: String, tenantSlug: String) async throws -> [String: Any] {
        let response = try await request(
            endpoint: "/auth/login",
            method: "POST",
            body: [
                "email": email,
                "password": password,
                "tenantSlug": tenantSlug
            ]
        )
        
        if let data = response["data"] as? [String: Any],
           let token = data["token"] as? String {
            setToken(token)
        }
        
        return response
    }
    
    func getProducts() async throws -> [String: Any] {
        return try await request(endpoint: "/products")
    }
}

enum APIError: Error {
    case invalidURL
    case invalidResponse
    case unauthorized
    case requestFailed
    case serverError(String)
}
```

---

## Best Practices

### 1. Token Storage

- **iOS**: Use Keychain Services
- **Android**: Use EncryptedSharedPreferences or Keystore
- **React Native**: Use `react-native-keychain` or `expo-secure-store`
- **Flutter**: Use `flutter_secure_storage`

### 2. Token Refresh

- Check token validity before making requests
- Implement automatic token refresh if needed
- Handle 401 errors gracefully by redirecting to login

### 3. Network Error Handling

- Implement retry logic for network failures
- Show user-friendly error messages
- Log errors for debugging

### 4. Request Timeouts

- Set appropriate timeout values (e.g., 30 seconds)
- Show loading indicators during requests
- Cancel requests when component unmounts (React Native/Flutter)

### 5. Offline Support

- Cache frequently accessed data
- Queue requests when offline
- Sync when connection is restored

### 6. Security

- Never store tokens in plain text
- Use HTTPS only in production
- Validate SSL certificates
- Implement certificate pinning for production apps

### 7. Rate Limiting

- Implement request throttling
- Handle 429 (Too Many Requests) responses
- Add delays between retries

### 8. Testing

- Test with different network conditions
- Test token expiration scenarios
- Test offline/online transitions
- Test error handling

---

## Environment Variables

For mobile apps, you may want to configure different API endpoints:

**Development**:
```
API_BASE_URL=http://localhost:3000/api
```

**Staging**:
```
API_BASE_URL=https://staging.your-domain.com/api
```

**Production**:
```
API_BASE_URL=https://your-domain.com/api
```

---

## Additional Resources

- [Next.js API Routes Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [JWT Authentication Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security/)

---

## Support

For API-related issues or questions, please contact your development team or refer to the main project documentation.
