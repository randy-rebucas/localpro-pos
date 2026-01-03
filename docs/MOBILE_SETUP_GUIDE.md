# Mobile App Setup Guide

Complete setup guide for implementing the customer mobile app with Twilio OTP authentication.

---

## Prerequisites

1. **Backend Setup**
   - 1POS backend running
   - MongoDB database configured
   - Environment variables set up

2. **Twilio Account**
   - Twilio account created
   - Phone number purchased/verified
   - Account SID and Auth Token obtained

3. **Mobile Development**
   - Expo CLI installed
   - Node.js and npm/yarn installed
   - Mobile device or emulator for testing

---

## Step 1: Backend Configuration

### 1.1 Install Twilio (if not already installed)

Twilio is already in `optionalDependencies` in `package.json`. To ensure it's installed:

```bash
npm install twilio
```

### 1.2 Configure Environment Variables

Add the following to your `.env` file:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE=+1234567890  # Your Twilio phone number (E.164 format)

# SMS Provider
SMS_PROVIDER=twilio

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
CUSTOMER_JWT_EXPIRES_IN=30d

# API Base URL (for mobile app)
NEXT_PUBLIC_API_URL=http://localhost:3000/api
# For production:
# NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

### 1.3 Verify Twilio Setup

Create a test script to verify Twilio is working:

```bash
# Create test script
cat > scripts/test-twilio.ts << 'EOF'
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE;

if (!accountSid || !authToken || !fromPhone) {
  console.error('❌ Twilio credentials not configured');
  console.log('Required environment variables:');
  console.log('  - TWILIO_ACCOUNT_SID');
  console.log('  - TWILIO_AUTH_TOKEN');
  console.log('  - TWILIO_PHONE');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

async function testTwilio() {
  try {
    console.log('📱 Testing Twilio connection...');
    
    // Test sending SMS (replace with your test phone number)
    const testPhone = process.argv[2];
    if (!testPhone) {
      console.log('Usage: tsx scripts/test-twilio.ts +1234567890');
      process.exit(1);
    }

    const message = await client.messages.create({
      body: 'Test message from 1POS',
      from: fromPhone,
      to: testPhone,
    });

    console.log('✅ SMS sent successfully!');
    console.log('Message SID:', message.sid);
  } catch (error: any) {
    console.error('❌ Twilio test failed:', error.message);
    process.exit(1);
  }
}

testTwilio();
EOF

# Run test (replace with your phone number)
tsx scripts/test-twilio.ts +1234567890
```

### 1.4 Test OTP Endpoint

Test the OTP endpoint using curl or Postman:

```bash
# Send OTP
curl -X POST http://localhost:3000/api/auth/customer/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "tenantSlug": "default"
  }'

# Check console for OTP in development mode
# Then verify OTP
curl -X POST http://localhost:3000/api/auth/customer/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "otp": "123456",
    "tenantSlug": "default",
    "firstName": "Test",
    "lastName": "User"
  }'
```

---

## Step 2: Mobile App Setup

### 2.1 Initialize Expo Project

```bash
# Create new Expo project
npx create-expo-app@latest localpro-mobile --template blank-typescript

cd localpro-mobile

# Install dependencies
npx expo install expo-router expo-secure-store expo-notifications
npm install axios zustand react-hook-form zod date-fns
```

### 2.2 Project Structure

```
localpro-mobile/
├── app/
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── _layout.tsx
│   ├── (tabs)/
│   │   ├── index.tsx
│   │   ├── bookings.tsx
│   │   ├── shop.tsx
│   │   ├── orders.tsx
│   │   ├── profile.tsx
│   │   └── _layout.tsx
│   └── _layout.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts
│   │   └── auth.ts
│   └── storage.ts
├── stores/
│   ├── authStore.ts
│   └── cartStore.ts
├── components/
│   └── common/
├── constants/
│   └── config.ts
└── app.json
```

### 2.3 Configure API Client

Create `lib/api/client.ts`:

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('customer_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, clear storage and redirect to login
      await SecureStore.deleteItemAsync('customer_token');
      await SecureStore.deleteItemAsync('customer_data');
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 2.4 Create Auth Service

Create `lib/api/auth.ts`:

```typescript
import api from './client';
import * as SecureStore from 'expo-secure-store';

export interface SendOTPRequest {
  phone: string;
  tenantSlug: string;
}

export interface VerifyOTPRequest {
  phone: string;
  otp: string;
  tenantSlug: string;
  firstName?: string;
  lastName?: string;
}

export interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    customer: Customer;
    token: string;
  };
  error?: string;
}

export async function sendOTP(data: SendOTPRequest): Promise<AuthResponse> {
  try {
    const response = await api.post('/auth/customer/send-otp', data);
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to send OTP',
    };
  }
}

export async function verifyOTP(data: VerifyOTPRequest): Promise<AuthResponse> {
  try {
    const response = await api.post('/auth/customer/verify-otp', data);
    
    if (response.data.success && response.data.data) {
      // Store token and customer data securely
      await SecureStore.setItemAsync('customer_token', response.data.data.token);
      await SecureStore.setItemAsync('customer_data', JSON.stringify(response.data.data.customer));
    }
    
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to verify OTP',
    };
  }
}

export async function getStoredCustomer(): Promise<Customer | null> {
  try {
    const customerData = await SecureStore.getItemAsync('customer_data');
    return customerData ? JSON.parse(customerData) : null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync('customer_token');
  await SecureStore.deleteItemAsync('customer_data');
}
```

### 2.5 Create Auth Store

Create `stores/authStore.ts`:

```typescript
import create from 'zustand';
import { Customer } from '@/lib/api/auth';
import { getStoredCustomer } from '@/lib/api/auth';

interface AuthState {
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setCustomer: (customer: Customer | null) => void;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  customer: null,
  isAuthenticated: false,
  isLoading: true,
  
  setCustomer: (customer) => set({ 
    customer, 
    isAuthenticated: !!customer 
  }),
  
  checkAuth: async () => {
    try {
      const customer = await getStoredCustomer();
      set({ 
        customer, 
        isAuthenticated: !!customer,
        isLoading: false 
      });
    } catch {
      set({ 
        customer: null, 
        isAuthenticated: false,
        isLoading: false 
      });
    }
  },
  
  logout: async () => {
    const { logout: logoutAuth } = await import('@/lib/api/auth');
    await logoutAuth();
    set({ 
      customer: null, 
      isAuthenticated: false 
    });
  },
}));
```

### 2.6 Create Login Screen

Create `app/(auth)/login.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { sendOTP, verifyOTP } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/authStore';

export default function LoginScreen() {
  const router = useRouter();
  const { setCustomer, isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<'phone' | 'otp' | 'register'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const TENANT_SLUG = 'default'; // Get from config

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await sendOTP({
        phone: phone.replace(/\D/g, ''), // Normalize phone
        tenantSlug: TENANT_SLUG,
      });

      if (result.success) {
        setStep('otp');
        setCountdown(60); // 60 second countdown
        Alert.alert('Success', 'OTP sent to your phone');
      } else {
        Alert.alert('Error', result.error || 'Failed to send OTP');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOTP({
        phone: phone.replace(/\D/g, ''),
        otp,
        tenantSlug: TENANT_SLUG,
      });

      if (result.success && result.data) {
        setCustomer(result.data.customer);
        
        // Check if customer needs to complete profile
        if (!result.data.customer.firstName || !result.data.customer.lastName) {
          setStep('register');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        Alert.alert('Error', result.error || 'Invalid OTP');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!firstName || !lastName) {
      Alert.alert('Error', 'Please enter your first and last name');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOTP({
        phone: phone.replace(/\D/g, ''),
        otp,
        tenantSlug: TENANT_SLUG,
        firstName,
        lastName,
      });

      if (result.success && result.data) {
        setCustomer(result.data.customer);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', result.error || 'Registration failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'phone') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Enter your phone number to continue</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoFocus
        />
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSendOTP}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Sending...' : 'Send OTP'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'otp') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {phone}
        </Text>
        
        <TextInput
          style={styles.input}
          placeholder="000000"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerifyOTP}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </Text>
        </TouchableOpacity>
        
        {countdown > 0 ? (
          <Text style={styles.countdown}>
            Resend OTP in {countdown}s
          </Text>
        ) : (
          <TouchableOpacity onPress={handleSendOTP}>
            <Text style={styles.resend}>Resend OTP</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (step === 'register') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Complete Profile</Text>
        <Text style={styles.subtitle}>Enter your name to continue</Text>
        
        <TextInput
          style={styles.input}
          placeholder="First Name"
          value={firstName}
          onChangeText={setFirstName}
          autoFocus
        />
        
        <TextInput
          style={styles.input}
          placeholder="Last Name"
          value={lastName}
          onChangeText={setLastName}
        />
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Registering...' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  countdown: {
    textAlign: 'center',
    marginTop: 15,
    color: '#666',
  },
  resend: {
    textAlign: 'center',
    marginTop: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
});
```

### 2.7 Configure App Constants

Create `constants/config.ts`:

```typescript
export const CONFIG = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api',
  TENANT_SLUG: 'default', // Change based on your tenant
};

// For development, you might want to use your local IP
// export const CONFIG = {
//   API_BASE_URL: 'http://192.168.1.100:3000/api', // Your local IP
//   TENANT_SLUG: 'default',
// };
```

---

## Step 3: Testing

### 3.1 Test Backend Endpoints

```bash
# Start backend server
npm run dev

# In another terminal, test OTP flow
# 1. Send OTP
curl -X POST http://localhost:3000/api/auth/customer/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "tenantSlug": "default"}'

# 2. Check console for OTP (in development mode)
# 3. Verify OTP
curl -X POST http://localhost:3000/api/auth/customer/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "otp": "123456",
    "tenantSlug": "default",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### 3.2 Test Mobile App

```bash
# Start Expo development server
cd localpro-mobile
npx expo start

# Scan QR code with Expo Go app on your phone
# Or press 'i' for iOS simulator, 'a' for Android emulator
```

### 3.3 Test Flow

1. Enter phone number
2. Receive OTP (check console in dev mode, or SMS in production)
3. Enter OTP
4. Complete profile (if new customer)
5. Navigate to home screen

---

## Step 4: Production Deployment

### 4.1 Update Environment Variables

```bash
# Production .env
TWILIO_ACCOUNT_SID=your_production_sid
TWILIO_AUTH_TOKEN=your_production_token
TWILIO_PHONE=+1234567890
SMS_PROVIDER=twilio
JWT_SECRET=your_strong_secret_key
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

### 4.2 Update Mobile App Config

```typescript
// constants/config.ts
export const CONFIG = {
  API_BASE_URL: 'https://your-domain.com/api',
  TENANT_SLUG: 'default',
};
```

### 4.3 Build Mobile App

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure app
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

---

## Troubleshooting

### OTP Not Received

1. Check Twilio credentials in `.env`
2. Verify phone number format (E.164: +1234567890)
3. Check Twilio account balance
4. Verify phone number is verified in Twilio (for trial accounts)
5. Check console logs for errors

### Authentication Fails

1. Verify JWT_SECRET is set
2. Check token expiry settings
3. Verify customer exists in database
4. Check API logs for errors

### Mobile App Can't Connect

1. Verify API_BASE_URL is correct
2. Check CORS settings in `next.config.ts`
3. Ensure backend is running
4. For local testing, use your computer's IP address instead of localhost

---

## Next Steps

1. ✅ Backend configured
2. ✅ Mobile app structure created
3. ✅ Authentication implemented
4. ⏭️ Implement booking screens
5. ⏭️ Implement shopping cart
6. ⏭️ Implement order history
7. ⏭️ Add push notifications
8. ⏭️ Test on real devices
9. ⏭️ Deploy to app stores

---

**Last Updated**: 2024
**Version**: 1.0
