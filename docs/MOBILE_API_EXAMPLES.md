# Mobile API Code Examples

Complete, ready-to-use code examples for integrating the 1POS API with various mobile platforms.

## Table of Contents

1. [React Native Examples](#react-native-examples)
2. [Flutter Examples](#flutter-examples)
3. [iOS Swift Examples](#ios-swift-examples)
4. [Android Kotlin Examples](#android-kotlin-examples)
5. [Common Patterns](#common-patterns)

---

## React Native Examples

### Complete API Client

```typescript
// api/client.ts
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = __DEV__
  ? 'http://localhost:3000/api'
  : 'https://your-domain.com/api';

class APIClient {
  private async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('auth_token');
  }

  private async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync('auth_token', token);
  }

  private async removeToken(): Promise<void> {
    await SecureStore.deleteItemAsync('auth_token');
  }

  async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const token = await this.getToken();
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle token expiration
      if (response.status === 401) {
        await this.removeToken();
        throw new Error('Unauthorized - Please login again');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error: any) {
      if (error.message.includes('Unauthorized')) {
        throw error;
      }
      throw new Error(error.message || 'Network error');
    }
  }

  // Authentication
  async login(email: string, password: string, tenantSlug: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
    });

    if (response.success && response.data.token) {
      await this.setToken(response.data.token);
    }

    return response;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      await this.removeToken();
    }
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Products
  async getProducts(params?: {
    search?: string;
    categoryId?: string;
    isActive?: boolean;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.categoryId) query.append('categoryId', params.categoryId);
    if (params?.isActive !== undefined) query.append('isActive', String(params.isActive));

    return this.request(`/products?${query.toString()}`);
  }

  async getProduct(id: string) {
    return this.request(`/products/${id}`);
  }

  async createProduct(productData: any) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
  }

  async updateProduct(id: string, productData: any) {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    });
  }

  async deleteProduct(id: string) {
    return this.request(`/products/${id}`, {
      method: 'DELETE',
    });
  }

  // Transactions
  async getTransactions(params?: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.status) query.append('status', params.status);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);

    return this.request(`/transactions?${query.toString()}`);
  }

  async createTransaction(transactionData: any) {
    return this.request('/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }

  async refundTransaction(id: string, refundData: any) {
    return this.request(`/transactions/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify(refundData),
    });
  }

  // Categories
  async getCategories() {
    return this.request('/categories');
  }

  // Discounts
  async validateDiscount(code: string, amount: number) {
    return this.request('/discounts/validate', {
      method: 'POST',
      body: JSON.stringify({ code, amount }),
    });
  }

  // Attendance
  async clockIn(location?: { latitude: number; longitude: number; address?: string }) {
    return this.request('/attendance', {
      method: 'POST',
      body: JSON.stringify({
        action: 'clock-in',
        location,
      }),
    });
  }

  async clockOut() {
    return this.request('/attendance', {
      method: 'POST',
      body: JSON.stringify({
        action: 'clock-out',
      }),
    });
  }

  async getCurrentAttendance() {
    return this.request('/attendance/current');
  }
}

export default new APIClient();
```

### Usage in Components

```typescript
// screens/ProductsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import APIClient from '../api/client';

export default function ProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);
      const data = await APIClient.getProducts({ isActive: true });
      setProducts(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red' }}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <View style={{ padding: 16, borderBottomWidth: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{item.name}</Text>
          <Text style={{ fontSize: 16, color: '#666' }}>${item.price}</Text>
          <Text style={{ fontSize: 14, color: '#999' }}>Stock: {item.stock}</Text>
        </View>
      )}
      refreshing={loading}
      onRefresh={loadProducts}
    />
  );
}
```

---

## Flutter Examples

### Complete API Client

```dart
// lib/api/client.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class APIClient {
  static const String baseUrl = 'https://your-domain.com/api';
  final FlutterSecureStorage _storage = FlutterSecureStorage();

  Future<String?> getToken() async {
    return await _storage.read(key: 'auth_token');
  }

  Future<void> setToken(String token) async {
    await _storage.write(key: 'auth_token', value: token);
  }

  Future<void> removeToken() async {
    await _storage.delete(key: 'auth_token');
  }

  Future<Map<String, dynamic>> request(
    String endpoint, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Map<String, String>? queryParams,
  }) async {
    final token = await getToken();
    var url = Uri.parse('$baseUrl$endpoint');

    if (queryParams != null && queryParams.isNotEmpty) {
      url = url.replace(queryParameters: queryParams);
    }

    final headers = {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    http.Response response;

    try {
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

      if (response.statusCode == 401) {
        await removeToken();
        throw Exception('Unauthorized - Please login again');
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode >= 400) {
        throw Exception(data['error'] ?? 'Request failed');
      }

      return data;
    } catch (e) {
      if (e.toString().contains('Unauthorized')) {
        rethrow;
      }
      throw Exception('Network error: ${e.toString()}');
    }
  }

  // Authentication
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

  Future<void> logout() async {
    try {
      await request('/auth/logout', method: 'POST');
    } finally {
      await removeToken();
    }
  }

  Future<Map<String, dynamic>> getCurrentUser() async {
    return await request('/auth/me');
  }

  // Products
  Future<Map<String, dynamic>> getProducts({
    String? search,
    String? categoryId,
    bool? isActive,
  }) async {
    final queryParams = <String, String>{};
    if (search != null) queryParams['search'] = search;
    if (categoryId != null) queryParams['categoryId'] = categoryId;
    if (isActive != null) queryParams['isActive'] = isActive.toString();

    return await request('/products', queryParams: queryParams);
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

### Usage in Widgets

```dart
// lib/screens/products_screen.dart
import 'package:flutter/material.dart';
import '../api/client.dart';

class ProductsScreen extends StatefulWidget {
  @override
  _ProductsScreenState createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  final APIClient _api = APIClient();
  List<dynamic> _products = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await _api.getProducts(isActive: true);
      setState(() {
        _products = data['data'] ?? [];
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Error: $_error', style: TextStyle(color: Colors.red)),
            ElevatedButton(
              onPressed: _loadProducts,
              child: Text('Retry'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadProducts,
      child: ListView.builder(
        itemCount: _products.length,
        itemBuilder: (context, index) {
          final product = _products[index];
          return ListTile(
            title: Text(product['name'] ?? ''),
            subtitle: Text('\$${product['price']}'),
            trailing: Text('Stock: ${product['stock']}'),
          );
        },
      ),
    );
  }
}
```

---

## iOS Swift Examples

### Complete API Client

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
    
    func removeToken() {
        token = nil
        KeychainHelper.shared.deleteToken()
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
            removeToken()
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

## Common Patterns

### Retry Logic

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      
      // Don't retry on 4xx errors (except 401)
      if (response.status >= 400 && response.status < 500 && response.status !== 401) {
        return response;
      }
    } catch (error) {
      if (i === retries - 1) throw error;
    }
    
    // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
  }
  
  throw new Error('Max retries exceeded');
}
```

### Request Caching

```typescript
class CachedAPIClient {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 60000; // 1 minute

  async request(endpoint: string, options?: RequestInit) {
    const cacheKey = `${endpoint}-${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    const data = await fetch(endpoint, options).then(r => r.json());
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }
}
```

### Offline Queue

```typescript
class OfflineQueue {
  private queue: Array<{ endpoint: string; options: RequestInit }> = [];
  private isOnline = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => this.processQueue());
    window.addEventListener('offline', () => { this.isOnline = false; });
  }

  async add(endpoint: string, options: RequestInit) {
    if (this.isOnline) {
      return fetch(endpoint, options);
    }
    
    this.queue.push({ endpoint, options });
    return Promise.resolve({ queued: true });
  }

  async processQueue() {
    this.isOnline = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        try {
          await fetch(item.endpoint, item.options);
        } catch (error) {
          this.queue.push(item); // Re-queue on failure
          break;
        }
      }
    }
  }
}
```

---

## Additional Resources

- [Quick Start Guide](./MOBILE_API_QUICK_START.md)
- [API Reference](./MOBILE_API_REFERENCE.md)
- [Troubleshooting Guide](./MOBILE_API_TROUBLESHOOTING.md)
- [Full Integration Guide](../MOBILE_API_INTEGRATION.md)
