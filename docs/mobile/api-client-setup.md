# Mobile API Client Setup

Guide to setting up API clients for different mobile platforms.

## React Native Setup

### Installation

```bash
npm install expo-secure-store
# or
npm install react-native-keychain
```

### Complete Client

```typescript
// api/client.ts
import * as SecureStore from 'expo-secure-store';

const API_BASE = __DEV__
  ? 'http://localhost:3000/api'
  : 'https://your-domain.com/api';

class APIClient {
  private async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('auth_token');
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const token = await this.getToken();
    const url = `${API_BASE}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      throw new Error('Unauthorized');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  async login(email: string, password: string, tenantSlug: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
    });

    if (response.success && response.data.token) {
      await SecureStore.setItemAsync('auth_token', response.data.token);
    }

    return response;
  }
}

export default new APIClient();
```

## Flutter Setup

### Installation

```yaml
# pubspec.yaml
dependencies:
  http: ^1.1.0
  flutter_secure_storage: ^9.0.0
```

### Complete Client

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
      default:
        throw Exception('Unsupported method');
    }

    if (response.statusCode == 401) {
      await _storage.delete(key: 'auth_token');
      throw Exception('Unauthorized');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Request failed');
    }

    return data;
  }
}
```

## iOS Swift Setup

### Complete Client

```swift
// APIClient.swift
import Foundation

class APIClient {
    static let shared = APIClient()
    private let baseURL = "https://your-domain.com/api"
    private var token: String?
    
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
            throw APIError.requestFailed
        }
        
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError.invalidResponse
        }
        
        return json
    }
}
```

## Android Kotlin Setup

### Complete Client

```kotlin
// APIClient.kt
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class APIClient(private val context: Context) {
    private val baseURL = "https://your-domain.com/api"
    private val client = OkHttpClient()
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "auth_prefs",
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private fun getToken(): String? {
        return prefs.getString("auth_token", null)
    }

    suspend fun request(
        endpoint: String,
        method: String = "GET",
        body: JSONObject? = null
    ): JSONObject {
        val token = getToken()
        val url = "$baseURL$endpoint"
        
        val requestBuilder = Request.Builder()
            .url(url)
            .addHeader("Content-Type", "application/json")
        
        if (token != null) {
            requestBuilder.addHeader("Authorization", "Bearer $token")
        }
        
        when (method) {
            "GET" -> requestBuilder.get()
            "POST" -> {
                val requestBody = body?.toString()
                    ?.toRequestBody("application/json".toMediaType())
                requestBuilder.post(requestBody ?: RequestBody.create(null, ""))
            }
        }
        
        val response = client.newCall(requestBuilder.build()).execute()
        
        if (response.code == 401) {
            prefs.edit().remove("auth_token").apply()
            throw Exception("Unauthorized")
        }
        
        if (!response.isSuccessful) {
            throw Exception("Request failed: ${response.code}")
        }
        
        val responseBody = response.body?.string() ?: "{}"
        return JSONObject(responseBody)
    }
}
```

## Next Steps

- [Authentication Guide](./authentication.md)
- [Feature Documentation](./features/)
- [Examples](../examples/)
