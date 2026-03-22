# Mobile API Quick Start

Get started with 1POS mobile API integration in 10 minutes.

> This is a condensed version. For detailed documentation, see [Mobile API Documentation](./README.md)

## Prerequisites

- 1POS instance running
- Tenant slug
- User credentials
- Mobile development environment

## Step 1: Authentication

```javascript
// Login
const response = await fetch('https://your-domain.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password',
    tenantSlug: 'your-tenant'
  })
});

const { data } = await response.json();
const token = data.token; // Save securely!
```

## Step 2: Store Token

```javascript
// React Native
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('auth_token', token);

// Flutter
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
final storage = FlutterSecureStorage();
await storage.write(key: 'auth_token', value: token);
```

## Step 3: Make Requests

```javascript
const token = await SecureStore.getItemAsync('auth_token');

const response = await fetch('https://your-domain.com/api/products', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

## Next Steps

- [Authentication Guide](./authentication.md)
- [Feature Documentation](./features/)
- [API Reference](./reference/api-reference.md)
