# Mobile API Troubleshooting Guide

Common issues and solutions when integrating the 1POS API with mobile applications.

## Table of Contents

1. [Authentication Issues](#authentication-issues)
2. [Network Errors](#network-errors)
3. [CORS Problems](#cors-problems)
4. [Token Expiration](#token-expiration)
5. [Request/Response Issues](#requestresponse-issues)
6. [Platform-Specific Issues](#platform-specific-issues)
7. [Performance Issues](#performance-issues)

---

## Authentication Issues

### Issue: "Not authenticated" or 401 Unauthorized

**Symptoms:**
- API returns 401 status code
- Error message: "Not authenticated" or "Unauthorized"

**Possible Causes:**
1. Token not included in request
2. Token expired
3. Invalid token format
4. Token not stored correctly

**Solutions:**

1. **Check if token is being sent:**
```javascript
console.log('Token:', token); // Should not be null/undefined
console.log('Headers:', {
  'Authorization': `Bearer ${token}`
});
```

2. **Verify token format:**
```javascript
// Token should start with "eyJ"
if (!token || !token.startsWith('eyJ')) {
  console.error('Invalid token format');
  // Re-authenticate
}
```

3. **Check token expiration:**
```javascript
// Decode JWT to check expiration (without verification)
const payload = JSON.parse(atob(token.split('.')[1]));
const expiration = new Date(payload.exp * 1000);
const now = new Date();

if (now > expiration) {
  console.log('Token expired, need to re-authenticate');
  // Re-authenticate
}
```

4. **Re-authenticate:**
```javascript
async function reAuthenticate() {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: storedEmail,
        password: storedPassword, // Use secure storage
        tenantSlug: tenantSlug
      }),
    });
    
    const data = await response.json();
    if (data.success) {
      await saveToken(data.data.token);
      return data.data.token;
    }
  } catch (error) {
    console.error('Re-authentication failed:', error);
  }
}
```

---

### Issue: Login fails with "Invalid credentials"

**Symptoms:**
- Login request returns 401
- Error message: "Invalid credentials"

**Solutions:**

1. **Verify credentials:**
```javascript
// Check if email/password are correct
console.log('Email:', email);
console.log('Tenant Slug:', tenantSlug);
// Password should not be logged for security
```

2. **Check tenant slug:**
```javascript
// Ensure tenant slug is correct
// Common mistake: extra spaces or wrong case
const tenantSlug = tenantSlug.trim().toLowerCase();
```

3. **Verify API endpoint:**
```javascript
// Make sure you're using the correct endpoint
const loginUrl = `${API_BASE}/auth/login`; // Not /api/auth/login/login
```

4. **Check request format:**
```javascript
// Ensure Content-Type header is set
headers: {
  'Content-Type': 'application/json'
}

// Ensure body is JSON string
body: JSON.stringify({
  email: email,
  password: password,
  tenantSlug: tenantSlug
})
```

---

## Network Errors

### Issue: Network request failed / Connection timeout

**Symptoms:**
- Request fails with network error
- Timeout errors
- "Failed to fetch" errors

**Solutions:**

1. **Check internet connection:**
```javascript
// Check network status before making requests
import NetInfo from '@react-native-community/netinfo';

const state = await NetInfo.fetch();
if (!state.isConnected) {
  console.error('No internet connection');
  // Show offline message
  return;
}
```

2. **Add timeout to requests:**
```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

try {
  const response = await fetch(url, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(timeoutId);
  return response;
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    throw new Error('Request timeout');
  }
  throw error;
}
```

3. **Retry logic:**
```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

4. **Check API base URL:**
```javascript
// Verify API base URL is correct
const API_BASE = __DEV__ 
  ? 'http://localhost:3000/api'  // Development
  : 'https://your-domain.com/api'; // Production

// For Android emulator, use 10.0.2.2 instead of localhost
const API_BASE = __DEV__ && Platform.OS === 'android'
  ? 'http://10.0.2.2:3000/api'
  : 'http://localhost:3000/api';
```

---

## CORS Problems

### Issue: CORS policy error

**Symptoms:**
- Browser console shows CORS error
- "Access-Control-Allow-Origin" error
- Request blocked by CORS policy

**Solutions:**

1. **Verify CORS configuration:**
   - Check `next.config.ts` has CORS headers configured
   - Ensure `Access-Control-Allow-Origin` is set correctly

2. **For development:**
```typescript
// next.config.ts
{
  key: 'Access-Control-Allow-Origin',
  value: '*' // Allow all origins in development
}
```

3. **For production:**
```typescript
// next.config.ts
{
  key: 'Access-Control-Allow-Origin',
  value: process.env.ALLOWED_ORIGINS || 'https://your-app-domain.com'
}
```

4. **Note:** CORS is primarily a browser concern. Native mobile apps (React Native, Flutter, iOS, Android) typically don't have CORS issues as they're not bound by browser security policies.

---

## Token Expiration

### Issue: Token expires frequently

**Symptoms:**
- Frequent 401 errors
- Users need to re-login often

**Solutions:**

1. **Implement token refresh:**
```javascript
async function getValidToken() {
  let token = await getStoredToken();
  
  if (!token) {
    // No token, need to login
    return null;
  }
  
  // Check if token is expired
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiration = new Date(payload.exp * 1000);
  const now = new Date();
  const timeUntilExpiry = expiration - now;
  
  // If token expires in less than 1 hour, refresh it
  if (timeUntilExpiry < 3600000) {
    token = await reAuthenticate();
  }
  
  return token;
}
```

2. **Automatic token refresh on 401:**
```javascript
async function apiRequest(url, options = {}) {
  let token = await getValidToken();
  
  let response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  // If 401, try to refresh token once
  if (response.status === 401) {
    token = await reAuthenticate();
    if (token) {
      // Retry with new token
      response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...options.headers
        }
      });
    }
  }
  
  return response;
}
```

---

## Request/Response Issues

### Issue: Request body not being sent correctly

**Symptoms:**
- API returns validation errors
- Data not received by server

**Solutions:**

1. **Verify Content-Type header:**
```javascript
headers: {
  'Content-Type': 'application/json'
}
```

2. **Ensure body is JSON string:**
```javascript
// Correct
body: JSON.stringify({ key: 'value' })

// Incorrect
body: { key: 'value' }
```

3. **Check request method:**
```javascript
// POST requests need body
method: 'POST',
body: JSON.stringify(data)

// GET requests use query parameters
const params = new URLSearchParams({ key: 'value' });
fetch(`${url}?${params}`)
```

---

### Issue: Response parsing errors

**Symptoms:**
- "Unexpected token" errors
- JSON parsing fails

**Solutions:**

1. **Check response content type:**
```javascript
const contentType = response.headers.get('content-type');
if (!contentType || !contentType.includes('application/json')) {
  const text = await response.text();
  console.error('Non-JSON response:', text);
  throw new Error('Invalid response format');
}
```

2. **Handle empty responses:**
```javascript
const text = await response.text();
if (!text) {
  return { success: true, data: null };
}
return JSON.parse(text);
```

3. **Error handling:**
```javascript
try {
  const data = await response.json();
  return data;
} catch (error) {
  const text = await response.text();
  console.error('JSON parse error:', text);
  throw new Error('Failed to parse response');
}
```

---

## Platform-Specific Issues

### React Native: Network request failed

**Solutions:**

1. **Android: Use IP address instead of localhost:**
```javascript
const API_BASE = Platform.OS === 'android' && __DEV__
  ? 'http://10.0.2.2:3000/api' // Android emulator
  : 'http://localhost:3000/api';
```

2. **iOS: Allow arbitrary loads (development only):**
```xml
<!-- ios/YourApp/Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

3. **Check network permissions:**
```xml
<!-- Android: android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
```

---

### Flutter: Certificate/CORS issues

**Solutions:**

1. **Allow self-signed certificates (development):**
```dart
class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

void main() {
  HttpOverrides.global = MyHttpOverrides();
  runApp(MyApp());
}
```

2. **Handle network errors:**
```dart
try {
  final response = await http.get(url);
  return jsonDecode(response.body);
} on SocketException {
  throw Exception('No internet connection');
} on HttpException {
  throw Exception('HTTP error');
} on FormatException {
  throw Exception('Invalid response format');
}
```

---

### iOS: App Transport Security

**Solutions:**

1. **Allow HTTP in development:**
```xml
<!-- ios/YourApp/Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>localhost</key>
    <dict>
      <key>NSExceptionAllowsInsecureHTTPLoads</key>
      <true/>
    </dict>
  </dict>
</dict>
```

2. **For production, use HTTPS only**

---

## Performance Issues

### Issue: Slow API responses

**Solutions:**

1. **Implement request caching:**
```javascript
const cache = new Map();

async function cachedRequest(url, options) {
  const cacheKey = `${url}-${JSON.stringify(options)}`;
  
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return cached.data;
    }
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  cache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
  
  return data;
}
```

2. **Use pagination:**
```javascript
// Don't fetch all data at once
const products = await fetch(`${API_BASE}/products?limit=20&page=1`);

// Use infinite scroll or pagination
```

3. **Debounce search requests:**
```javascript
import { debounce } from 'lodash';

const debouncedSearch = debounce(async (query) => {
  const results = await searchProducts(query);
  setResults(results);
}, 300);
```

---

## Debugging Tips

### 1. Enable request logging:
```javascript
async function apiRequest(url, options) {
  console.log('Request:', {
    url,
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body
  });
  
  const response = await fetch(url, options);
  
  console.log('Response:', {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries())
  });
  
  const data = await response.json();
  console.log('Response data:', data);
  
  return data;
}
```

### 2. Use network debugging tools:
- **React Native**: React Native Debugger, Flipper
- **Flutter**: Flutter DevTools
- **iOS**: Charles Proxy, Proxyman
- **Android**: Android Studio Network Profiler

### 3. Test with curl:
```bash
# Test login
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password","tenantSlug":"tenant"}'

# Test authenticated request
curl https://your-domain.com/api/products \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Getting Help

If you're still experiencing issues:

1. Check the [API Reference](./MOBILE_API_REFERENCE.md)
2. Review the [Full Integration Guide](../MOBILE_API_INTEGRATION.md)
3. Check server logs for detailed error messages
4. Contact your development team with:
   - Error messages
   - Request/response logs
   - Platform and version information
   - Steps to reproduce
