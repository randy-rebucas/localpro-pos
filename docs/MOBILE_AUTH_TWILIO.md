# Mobile Authentication with Twilio OTP

This document describes the customer authentication system using Twilio SMS OTP (One-Time Password) for the mobile application.

---

## Overview

The mobile app uses SMS-based OTP authentication via Twilio instead of traditional email/password authentication. This provides a seamless, secure login experience for customers.

---

## Authentication Flow

### 1. Send OTP

**Endpoint:** `POST /api/auth/customer/send-otp`

**Request:**
```json
{
  "phone": "+1234567890",
  "tenantSlug": "default"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

**Features:**
- Generates 6-digit OTP
- Valid for 10 minutes
- Rate limited (1 OTP per minute per phone)
- Auto-expires expired OTPs
- Sends SMS via Twilio

### 2. Verify OTP

**Endpoint:** `POST /api/auth/customer/verify-otp`

**Request:**
```json
{
  "phone": "+1234567890",
  "otp": "123456",
  "tenantSlug": "default",
  "firstName": "John",  // Required for new customers
  "lastName": "Doe"    // Required for new customers
}
```

**Response:**
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

**Features:**
- Verifies OTP code
- Creates customer account if doesn't exist
- Returns JWT token (valid for 30 days)
- Sets HTTP-only cookie

---

## Implementation Example

### React Native / Expo

```typescript
// lib/api/auth.ts
import api from './client';

export async function sendOTP(phone: string, tenantSlug: string) {
  const response = await api.post('/auth/customer/send-otp', {
    phone,
    tenantSlug,
  });
  return response.data;
}

export async function verifyOTP(
  phone: string,
  otp: string,
  tenantSlug: string,
  firstName?: string,
  lastName?: string
) {
  const response = await api.post('/auth/customer/verify-otp', {
    phone,
    otp,
    tenantSlug,
    firstName,
    lastName,
  });
  
  if (response.data.success) {
    // Store token securely
    await SecureStore.setItemAsync('customer_token', response.data.data.token);
    await SecureStore.setItemAsync('customer_data', JSON.stringify(response.data.data.customer));
  }
  
  return response.data;
}
```

### Login Screen Component

```typescript
import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { sendOTP, verifyOTP } from '@/lib/api/auth';
import * as SecureStore from 'expo-secure-store';

export function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'register'>('phone');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async () => {
    setLoading(true);
    try {
      await sendOTP(phone, 'default');
      setStep('otp');
    } catch (error) {
      alert('Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      const result = await verifyOTP(phone, otp, 'default');
      
      if (result.success) {
        // Check if customer needs to register
        if (!result.data.customer.firstName) {
          setStep('register');
        } else {
          // Navigate to home
          navigation.navigate('Home');
        }
      }
    } catch (error) {
      alert('Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const result = await verifyOTP(phone, otp, 'default', firstName, lastName);
      if (result.success) {
        navigation.navigate('Home');
      }
    } catch (error) {
      alert('Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'phone') {
    return (
      <View>
        <Text>Enter your phone number</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+1234567890"
          keyboardType="phone-pad"
        />
        <Button title="Send OTP" onPress={handleSendOTP} disabled={loading} />
      </View>
    );
  }

  if (step === 'otp') {
    return (
      <View>
        <Text>Enter the OTP sent to {phone}</Text>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
        />
        <Button title="Verify OTP" onPress={handleVerifyOTP} disabled={loading} />
        <Button title="Resend OTP" onPress={handleSendOTP} />
      </View>
    );
  }

  if (step === 'register') {
    return (
      <View>
        <Text>Complete your profile</Text>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First Name"
        />
        <TextInput
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last Name"
        />
        <Button title="Register" onPress={handleRegister} disabled={loading} />
      </View>
    );
  }
}
```

---

## API Endpoints

### Customer Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/customer/send-otp` | Send OTP to phone | No |
| POST | `/api/auth/customer/verify-otp` | Verify OTP and login | No |

### Customer Data

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/bookings/customer/{customerId}` | Get customer bookings | Yes |
| GET | `/api/transactions/customer/{customerId}` | Get customer orders | Yes |

---

## Security Features

1. **OTP Expiry**: OTPs expire after 10 minutes
2. **Rate Limiting**: Maximum 1 OTP per minute per phone
3. **Attempt Limiting**: Maximum 5 verification attempts per OTP
4. **Auto-cleanup**: Expired OTPs are automatically deleted
5. **JWT Tokens**: Secure token-based authentication (30-day expiry)
6. **HTTP-only Cookies**: Tokens stored in secure HTTP-only cookies

---

## Environment Variables

Required environment variables for Twilio:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1234567890  # Your Twilio phone number

# SMS Provider (set to 'twilio')
SMS_PROVIDER=twilio

# JWT Configuration
JWT_SECRET=your-secret-key
CUSTOMER_JWT_EXPIRES_IN=30d
```

---

## Error Handling

### Common Errors

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Phone number is required"
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Invalid or expired OTP"
}
```

**429 Too Many Requests:**
```json
{
  "success": false,
  "error": "Please wait before requesting another OTP",
  "retryAfter": 60
}
```

---

## Testing

### Development Mode

In development mode (when Twilio is not configured), OTPs are logged to the console:

```
📱 OTP for +1234567890: 123456
```

### Production Mode

In production, ensure:
1. Twilio credentials are properly configured
2. Twilio phone number is verified
3. SMS_PROVIDER is set to 'twilio'
4. Test with real phone numbers

---

## Phone Number Format

- Phone numbers are normalized (all non-digits removed)
- Format: `+1234567890` or `1234567890`
- Minimum length: 10 digits
- International format supported

---

## Customer Account Creation

- New customers are automatically created on first OTP verification
- Requires `firstName` and `lastName` for new customers
- Existing customers are automatically logged in
- Customer data is linked by phone number

---

## Token Management

### Storing Tokens

```typescript
// Store token securely
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('customer_token', token);
```

### Using Tokens

```typescript
// Include token in API requests
const token = await SecureStore.getItemAsync('customer_token');

const response = await fetch(`${API_URL}/bookings/customer/${customerId}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

### Token Expiry

- Tokens expire after 30 days
- On 401 error, redirect to login
- Implement token refresh if needed

---

## Best Practices

1. **Phone Validation**: Validate phone format on client side
2. **OTP Input**: Use 6-digit input with auto-submit
3. **Resend OTP**: Allow resend after 60 seconds
4. **Error Messages**: Show user-friendly error messages
5. **Loading States**: Show loading indicators during API calls
6. **Offline Handling**: Handle network errors gracefully

---

## Migration from Email/Password

If you need to support both authentication methods:

1. Check if customer has email/password
2. Show appropriate login screen
3. Allow switching between methods
4. Link accounts by phone number

---

**Last Updated**: 2024
**Version**: 1.0
