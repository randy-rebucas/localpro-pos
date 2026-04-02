# Authentication 401 Errors - Fixed

## Issues Identified & Resolved

### 1. **SubscriptionContext Missing Credentials** ✅ FIXED
**Problem:** The `/api/subscription/status` endpoint fetch was missing `credentials: 'include'`, causing the browser not to send auth tokens.

**Location:** [contexts/SubscriptionContext.tsx](contexts/SubscriptionContext.tsx#L90)

**Before:**
```javascript
const response = await fetch('/api/subscription/status');
// Browser doesn't send cookies → 401 Unauthorized
```

**After:**
```javascript
const response = await fetch('/api/subscription/status', { credentials: 'include' });
// Browser sends auth-token cookie → Proper authentication
```

---

### 2. **API Client Not Auto-Including Credentials** ✅ FIXED
**Problem:** The `apiFetch()` utility wrapper didn't automatically include credentials, making it easy to forget this critical security setting.

**Location:** [lib/api-client.ts](lib/api-client.ts)

**Before:**
```typescript
export async function apiFetch<T = any>(url: string, options?: RequestInit) {
  const response = await fetch(url, fetchOptions);
  return handleApiResponse<T>(response);
}
// Developer must remember to add credentials: 'include'
```

**After:**
```typescript
export async function apiFetch<T = any>(url: string, options?: RequestInit) {
  const credentials = fetchOptions.credentials || 'include'; // Auto-includes!
  const response = await fetch(url, { ...fetchOptions, credentials });
  return handleApiResponse<T>(response);
}
// Credentials included by default, safe to override if needed
```

---

## Authentication Flow - How It Works

### Cookie Setup (On Login)
✅ [app/api/auth/login/route.ts](app/api/auth/login/route.ts) sets the auth-token cookie:
```typescript
response.cookies.set('auth-token', token, {
  httpOnly: true,          // Not accessible to JavaScript
  secure: true,            // Only sent over HTTPS in production
  sameSite: 'lax',         // Sent with same-origin and top-level navigations
  path: '/',
  maxAge: 60 * 60 * 24 * 7 // 7 days
});
```

### Cookie Transmission (On API Calls)
✅ All authenticated API calls must include `credentials: 'include'`:
```javascript
// ✅ Correct - Will send auth-token cookie
fetch('/api/auth/me', { credentials: 'include' });
fetch('/api/subscription/status', { credentials: 'include' });

// ❌ Wrong - Won't send auth-token cookie
fetch('/api/auth/me');
```

### Verified Secure Endpoints
The following endpoints already have proper credentials:
- `AuthContext.checkAuth()` — ✅ Has `credentials: 'include'`
- `SubscriptionContext.refreshSubscription()` — ✅ Fixed to include credentials
- All profile endpoints — ✅ Have `credentials: 'include'`
- All logout endpoints — ✅ Have `credentials: 'include'`

---

## How to Prevent Future 401 Errors

### Option 1: Use `apiFetch()` (Recommended)
Now that `apiFetch` auto-includes credentials, prefer it over direct `fetch()`:

```typescript
import { apiFetch } from '@/lib/api-client';

// Credentials automatically included
const data = await apiFetch('/api/subscription/status');
```

### Option 2: Use Direct `fetch()` with Credentials
If using raw `fetch()`, always include credentials:

```typescript
const res = await fetch('/api/auth/me', { 
  credentials: 'include' 
});
```

### Option 3: Use `useAuthContext()` Hook
For authentication state, use the built-in hook:

```typescript
const { user, login, logout } = useAuthContext();
// Handles all auth calls with proper credentials
```

---

## Testing the Fix

### Local Development
1. Start the server: `pnpm run dev`
2. Open DevTools → Network tab
3. Navigate to a protected page
4. Look for `/api/auth/me` request
5. Check Request Headers → verify `Cookie: auth-token=...` is present
6. Verify response status is 200 (not 401)

### Browser Console
The following error should no longer appear:
```
GET /api/auth/me:1 Failed to load resource: the server responded with a status of 401 ()
GET /api/subscription/status 401 (Unauthorized)
```

---

## Cookie Security Best Practices

✅ **What We're Doing Right:**
- `httpOnly` — Cookie not exposed to JavaScript (prevented XSS attacks)
- `secure` — Only sent over HTTPS in production
- `sameSite: 'lax'` — Prevents CSRF attacks
- `SameSite: Lax` limits cross-site cookie sending while allowing same-site operations

⚠️ **Remember:**
- Never log auth tokens to console
- Never expose tokens in URLs (use cookies/headers instead)
- Implement token refresh for production use
- Set appropriate token expiration times

---

## Status Summary

| Issue | Status | Fix |
|-------|--------|-----|
| SubscriptionContext missing credentials | ✅ Fixed | Added `credentials: 'include'` |
| apiFetch not auto-including credentials | ✅ Fixed | Updated to auto-include with override option |
| 401 Unauthorized on /api/auth/me | ✅ Verified Working | Already had proper credentials |
| 401 Unauthorized on /api/subscription/status | ✅ Fixed | Added credentials to fetch |

All authentication 401 errors should now be resolved! 🎯

