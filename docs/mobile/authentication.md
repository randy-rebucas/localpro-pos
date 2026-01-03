# Mobile API Authentication

Complete guide to authenticating with the 1POS API from mobile applications.

## Overview

The 1POS API uses **JWT (JSON Web Tokens)** for authentication. After successful login, you receive a token that must be included in all subsequent API requests.

## Authentication Methods

### 1. Email/Password Login

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

### 2. PIN Login

**Endpoint:** `POST /api/auth/login-pin`

**Request:**
```json
{
  "pin": "1234",
  "tenantSlug": "your-tenant-slug"
}
```

**Use Case:** Quick login for cashiers using PIN codes.

### 3. QR Code Login

**Endpoint:** `POST /api/auth/login-qr`

**Request:**
```json
{
  "qrToken": "qr_token_string",
  "tenantSlug": "your-tenant-slug"
}
```

**Use Case:** Contactless login using QR codes.

## Token Management

### Token Storage

**Never store tokens in plain text!** Use platform-specific secure storage:

#### React Native
```typescript
import * as SecureStore from 'expo-secure-store';

// Store
await SecureStore.setItemAsync('auth_token', token);

// Retrieve
const token = await SecureStore.getItemAsync('auth_token');

// Delete
await SecureStore.deleteItemAsync('auth_token');
```

#### Flutter
```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final storage = FlutterSecureStorage();

// Store
await storage.write(key: 'auth_token', value: token);

// Retrieve
final token = await storage.read(key: 'auth_token');

// Delete
await storage.delete(key: 'auth_token');
```

#### iOS (Swift)
```swift
import Security

// Store
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "auth_token",
    kSecValueData as String: token.data(using: .utf8)!
]
SecItemAdd(query as CFDictionary, nil)

// Retrieve
let getQuery: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "auth_token",
    kSecReturnData as String: true
]
var result: AnyObject?
SecItemCopyMatching(getQuery as CFDictionary, &result)
```

#### Android (Kotlin)
```kotlin
import androidx.security.crypto.EncryptedSharedPreferences

val prefs = EncryptedSharedPreferences.create(
    context,
    "auth_prefs",
    MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Store
prefs.edit().putString("auth_token", token).apply()

// Retrieve
val token = prefs.getString("auth_token", null)

// Delete
prefs.edit().remove("auth_token").apply()
```

## Using Tokens

### Include in Requests

All authenticated endpoints require the token in the `Authorization` header:

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Token Expiration

- **Default expiration:** 7 days
- **Check expiration:** Decode JWT and check `exp` claim
- **Handle expiration:** Re-authenticate when receiving 401 errors

### Token Refresh Pattern

```typescript
async function getValidToken(): Promise<string | null> {
  let token = await getStoredToken();
  
  if (!token) return null;
  
  // Decode token (without verification)
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiration = new Date(payload.exp * 1000);
  const now = new Date();
  
  // Refresh if expires in less than 1 hour
  if (expiration.getTime() - now.getTime() < 3600000) {
    token = await reAuthenticate();
  }
  
  return token;
}
```

## Error Handling

### 401 Unauthorized

Token expired or invalid. Handle by:

1. Clear stored token
2. Redirect to login screen
3. Optionally attempt re-authentication

```typescript
if (response.status === 401) {
  await removeToken();
  // Navigate to login
  throw new Error('Session expired');
}
```

### 403 Forbidden

User doesn't have required permissions. Check user role.

## Logout

**Endpoint:** `POST /api/auth/logout`

**Request:**
```javascript
await fetch('https://your-domain.com/api/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Always clear local token
await removeToken();
```

## Security Best Practices

1. ✅ **Use HTTPS only** in production
2. ✅ **Store tokens securely** (Keychain, Keystore, SecureStorage)
3. ✅ **Never log tokens** or include in error messages
4. ✅ **Clear tokens on logout** or app uninstall
5. ✅ **Handle token expiration** gracefully
6. ✅ **Validate SSL certificates** in production
7. ✅ **Consider certificate pinning** for high-security apps

## Complete Example

```typescript
class AuthService {
  private async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('auth_token');
  }

  async login(email: string, password: string, tenantSlug: string) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantSlug })
    });

    const data = await response.json();
    
    if (data.success && data.data.token) {
      await SecureStore.setItemAsync('auth_token', data.data.token);
      return data.data;
    }
    
    throw new Error(data.error || 'Login failed');
  }

  async logout() {
    const token = await this.getToken();
    
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        // Continue with local logout even if API call fails
      }
    }
    
    await SecureStore.deleteItemAsync('auth_token');
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;
    
    // Check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiration = new Date(payload.exp * 1000);
      return expiration > new Date();
    } catch {
      return false;
    }
  }
}
```

## Next Steps

- [API Client Setup](./api-client-setup.md)
- [Feature Documentation](./features/)
- [Troubleshooting](../troubleshooting/common-issues.md)
