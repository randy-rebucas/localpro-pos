# Facebook Authentication Setup Guide

This guide explains how to set up and use Facebook authentication for customer login in the 1POS system.

## Overview

The Facebook authentication endpoint allows customers to log in using their Facebook account. The system:
1. Verifies the Facebook access token
2. Retrieves user information from Facebook
3. Creates or finds the customer account
4. Returns a JWT token for the customer

## API Endpoint

### POST `/api/auth/customer/facebook`

**Request Body:**
```json
{
  "accessToken": "facebook_access_token_here",
  "tenantSlug": "default" // optional
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "_id": "customer_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+1234567890",
      "facebookId": "123456789"
    }
  }
}
```

**Error Responses:**

- `400` - Missing access token
- `401` - Invalid or expired Facebook token
- `404` - Tenant not found
- `409` - Account already exists
- `500` - Server error

## Setup Instructions

### 1. Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add "Facebook Login" product to your app
4. Configure OAuth settings:
   - Add valid OAuth redirect URIs
   - Set app domain
   - Configure privacy policy URL

### 2. Get App Credentials

1. Go to Settings → Basic in your Facebook app
2. Note your **App ID** and **App Secret**
3. These will be used in environment variables

### 3. Configure Environment Variables

Add the following to your `.env` file:

```env
# Facebook App Configuration (optional but recommended)
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
```

**Note:** The Facebook App ID and Secret are optional. If not provided, the system will still verify tokens but won't perform additional app ID validation. It's recommended to set these for production.

### 4. Request Permissions

When implementing the mobile app, request the following permissions from Facebook:

- `email` - To get user's email address
- `public_profile` - To get basic profile information (name, picture)

Example Facebook SDK request:
```javascript
// React Native / Expo
import * as Facebook from 'expo-facebook';

const result = await Facebook.logInWithReadPermissionsAsync({
  permissions: ['public_profile', 'email'],
});
```

## How It Works

### Authentication Flow

1. **Client Side:**
   - User taps "Login with Facebook"
   - Mobile app requests Facebook login
   - Facebook SDK returns access token
   - App sends access token to `/api/auth/customer/facebook`

2. **Server Side:**
   - Verifies access token with Facebook Graph API
   - Retrieves user information (id, email, name)
   - Checks if customer exists by Facebook ID
   - If not found, checks by email (for account linking)
   - Creates new customer or updates existing one
   - Generates JWT token
   - Returns token and user information

### Account Linking

The system supports automatic account linking:
- If a customer logs in with Facebook and an account with the same email exists, the Facebook ID is linked to that account
- This allows customers to use multiple login methods with the same account

### Customer Model Updates

The Customer model now includes:
- `facebookId` - Unique Facebook user ID
- Indexed for fast lookups
- Unique per tenant

## Security Considerations

1. **Token Verification:**
   - All tokens are verified with Facebook Graph API
   - Invalid or expired tokens are rejected
   - Optional app ID validation ensures token belongs to your app

2. **Data Privacy:**
   - Only requested permissions are retrieved
   - Email is optional (some users may not provide it)
   - Facebook ID is stored securely

3. **Account Security:**
   - Facebook ID is unique per tenant
   - Email uniqueness is maintained per tenant
   - Existing accounts can be linked via email

## Testing

### Test with Facebook Test Users

1. Create test users in Facebook App Dashboard
2. Use test user credentials to log in
3. Verify authentication flow works correctly

### Test Token Verification

```bash
# Test the endpoint
curl -X POST http://localhost:3000/api/auth/customer/facebook \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "your_test_token",
    "tenantSlug": "default"
  }'
```

## Error Handling

### Common Errors

1. **Invalid Token:**
   - Token expired or invalid
   - Solution: Request new token from Facebook

2. **Missing Permissions:**
   - Email permission not granted
   - Solution: Request email permission in mobile app

3. **Account Conflict:**
   - Facebook ID or email already exists
   - Solution: System automatically links accounts when possible

## Mobile App Integration

### Example Implementation

```typescript
// lib/api/auth.ts
export const authAPI = {
  loginWithFacebook: async (accessToken: string, tenantSlug?: string) => {
    const response = await apiClient.post('/auth/customer/facebook', {
      accessToken,
      tenantSlug,
    });
    return response.data;
  },
};
```

### Usage in Mobile App

```typescript
import * as Facebook from 'expo-facebook';
import { authAPI } from '@/lib/api/auth';

const handleFacebookLogin = async () => {
  try {
    // Initialize Facebook (do this once at app startup)
    await Facebook.initializeAsync({
      appId: 'YOUR_FACEBOOK_APP_ID',
    });

    // Request login
    const result = await Facebook.logInWithReadPermissionsAsync({
      permissions: ['public_profile', 'email'],
    });

    if (result.type === 'success') {
      // Send token to backend
      const response = await authAPI.loginWithFacebook(
        result.token,
        'default'
      );

      if (response.success) {
        // Store token and navigate to app
        await SecureStore.setItemAsync('customer-auth-token', response.data.token);
        router.replace('/(tabs)');
      }
    }
  } catch (error) {
    console.error('Facebook login error:', error);
  }
};
```

## Troubleshooting

### Issue: "Invalid Facebook token"
- **Cause:** Token expired or invalid
- **Solution:** Request new token from Facebook SDK

### Issue: "Unable to retrieve name from Facebook"
- **Cause:** Name permission not granted or user hasn't set name
- **Solution:** Ensure `public_profile` permission is requested

### Issue: "Account already exists"
- **Cause:** Facebook ID or email already registered
- **Solution:** System should automatically link accounts. Check logs for details.

### Issue: Token verification fails
- **Cause:** Network issues or Facebook API down
- **Solution:** Check network connectivity and Facebook API status

## Best Practices

1. **Always verify tokens server-side** - Never trust client-provided tokens
2. **Request minimal permissions** - Only request what you need
3. **Handle missing email** - Some users may not provide email
4. **Implement account linking** - Allow users to link multiple auth methods
5. **Store tokens securely** - Use SecureStore or similar
6. **Handle errors gracefully** - Provide clear error messages to users

## Additional Resources

- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login/)
- [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
- [Expo Facebook SDK](https://docs.expo.dev/versions/latest/sdk/facebook/)

---

**Last Updated:** 2024
