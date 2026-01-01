# Mobile API Quick Start Guide

This guide will help you get started with integrating the LocalPro POS API into your mobile application in under 10 minutes.

## Prerequisites

- A deployed LocalPro POS instance (or local development server)
- Your tenant slug
- Valid user credentials (email/password or PIN)
- Mobile development environment (React Native, Flutter, iOS, Android, etc.)

## Step 1: Get Your API Base URL

**Development:**
```
http://localhost:3000/api
```

**Production:**
```
https://your-domain.com/api
```

## Step 2: Authenticate

### Option A: Email/Password Login

```javascript
const response = await fetch('https://your-domain.com/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'your-password',
    tenantSlug: 'your-tenant-slug'
  }),
});

const data = await response.json();
const token = data.data.token; // Save this token!
```

### Option B: PIN Login

```javascript
const response = await fetch('https://your-domain.com/api/auth/login-pin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    pin: '1234',
    tenantSlug: 'your-tenant-slug'
  }),
});

const data = await response.json();
const token = data.data.token; // Save this token!
```

## Step 3: Store the Token Securely

### React Native (using expo-secure-store)
```javascript
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('auth_token', token);
```

### React Native (using react-native-keychain)
```javascript
import * as Keychain from 'react-native-keychain';

await Keychain.setGenericPassword('auth_token', token);
```

### Flutter
```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final storage = FlutterSecureStorage();
await storage.write(key: 'auth_token', value: token);
```

### iOS (Swift)
```swift
import Security

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "auth_token",
    kSecValueData as String: token.data(using: .utf8)!
]
SecItemAdd(query as CFDictionary, nil)
```

### Android (Kotlin)
```kotlin
import android.content.Context
import android.content.SharedPreferences
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

prefs.edit().putString("auth_token", token).apply()
```

## Step 4: Make Authenticated Requests

```javascript
// Retrieve stored token
const token = await SecureStore.getItemAsync('auth_token');

// Make API request
const response = await fetch('https://your-domain.com/api/products', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data.data); // Your products array
```

## Step 5: Handle Token Expiration

```javascript
async function makeAuthenticatedRequest(url, options = {}) {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle token expiration
  if (response.status === 401) {
    // Token expired, redirect to login
    await SecureStore.deleteItemAsync('auth_token');
    // Navigate to login screen
    return null;
  }

  return response.json();
}
```

## Common API Calls

### Get Products
```javascript
const products = await makeAuthenticatedRequest(
  'https://your-domain.com/api/products'
);
```

### Create Transaction
```javascript
const transaction = await makeAuthenticatedRequest(
  'https://your-domain.com/api/transactions',
  {
    method: 'POST',
    body: JSON.stringify({
      items: [
        {
          product: 'product_id',
          name: 'Product Name',
          price: 10.99,
          quantity: 2,
          subtotal: 21.98,
        },
      ],
      subtotal: 21.98,
      total: 21.98,
      paymentMethod: 'cash',
      cashReceived: 25.00,
      change: 3.02,
    }),
  }
);
```

### Get Current User
```javascript
const user = await makeAuthenticatedRequest(
  'https://your-domain.com/api/auth/me'
);
```

## Complete Example: React Native

```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://your-domain.com/api';

async function apiRequest(endpoint, options = {}) {
  const token = await SecureStore.getItemAsync('auth_token');
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    await SecureStore.deleteItemAsync('auth_token');
    throw new Error('Unauthorized');
  }

  return response.json();
}

export default function ProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const data = await apiRequest('/products');
      setProducts(data.data);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Text>Loading...</Text>;
  }

  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <View>
          <Text>{item.name}</Text>
          <Text>${item.price}</Text>
        </View>
      )}
    />
  );
}
```

## Next Steps

- Read the [Complete API Reference](./MOBILE_API_REFERENCE.md)
- Check out [Code Examples](./MOBILE_API_EXAMPLES.md)
- Review [Troubleshooting Guide](./MOBILE_API_TROUBLESHOOTING.md)

## Need Help?

- Check the [Full Integration Guide](../MOBILE_API_INTEGRATION.md)
- Review API endpoint documentation
- Contact your development team
