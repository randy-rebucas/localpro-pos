# Mobile App Implementation Guide

## Quick Start

This guide provides step-by-step instructions for implementing the 1POS mobile app based on the [Client Specification](./MOBILE_APP_CLIENT_SPECIFICATION.md).

---

## Prerequisites

- Node.js 18+ installed
- Expo CLI installed: `npm install -g expo-cli`
- EAS CLI installed: `npm install -g eas-cli`
- iOS Simulator (for Mac) or Android Emulator
- Code editor (VS Code recommended)

---

## Step 1: Project Setup

### Initialize Expo Project

```bash
# Create new Expo project
npx create-expo-app@latest 1pos-mobile --template blank-typescript

# Navigate to project
cd 1pos-mobile

# Install dependencies
npm install
```

### Install Required Packages

```bash
# Core dependencies
npm install expo-router react-native-safe-area-context
npm install axios react-query zustand
npm install expo-secure-store @react-native-async-storage/async-storage
npm install react-hook-form zod
npm install date-fns react-native-calendars
npm install expo-image

# UI libraries (choose one)
npm install react-native-paper  # OR
npm install native-base

# Navigation
npm install @react-navigation/native
npm install react-native-screens react-native-gesture-handler

# Development dependencies
npm install --save-dev @types/react @types/react-native
npm install --save-dev eslint prettier @typescript-eslint/parser
```

### Configure Expo Router

Create `app.json`:

```json
{
  "expo": {
    "name": "1POS Mobile",
    "slug": "1pos-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.1pos.mobile"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.1pos.mobile"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "scheme": "1pos",
    "plugins": [
      "expo-router"
    ]
  }
}
```

---

## Step 2: Project Structure

Create the following directory structure:

```
1pos-mobile/
├── app/
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── verify-otp.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── services.tsx
│   │   ├── products.tsx
│   │   ├── bookings.tsx
│   │   ├── orders.tsx
│   │   └── profile.tsx
│   ├── booking/
│   │   ├── create.tsx
│   │   └── [id].tsx
│   ├── product/
│   │   └── [id].tsx
│   ├── cart/
│   │   ├── index.tsx
│   │   └── checkout.tsx
│   └── _layout.tsx
├── components/
│   ├── common/
│   ├── booking/
│   ├── product/
│   └── cart/
├── lib/
│   ├── api/
│   ├── services/
│   ├── storage/
│   └── utils/
├── store/
├── types/
├── constants/
└── assets/
```

---

## Step 3: Environment Configuration

Create `.env` file:

```env
EXPO_PUBLIC_API_URL=https://your-api-domain.com/api
EXPO_PUBLIC_TENANT_SLUG=default
```

Create `constants/config.ts`:

```typescript
export const config = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api',
  TENANT_SLUG: process.env.EXPO_PUBLIC_TENANT_SLUG || 'default',
  APP_NAME: '1POS Mobile',
};
```

---

## Step 4: API Client Setup

Create `lib/api/client.ts`:

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { config } from '@/constants/config';

const apiClient = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('customer-auth-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  const tenantSlug = await SecureStore.getItemAsync('tenant-slug') || config.TENANT_SLUG;
  config.params = { ...config.params, tenant: tenantSlug };
  
  return config;
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('customer-auth-token');
      // Navigate to login
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## Step 5: Authentication Implementation

### Auth Store

Create `store/authStore.ts` (see specification for full implementation).

### Login Screen

Create `app/(auth)/login.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { sendOTP, createGuestSession } = useAuthStore();

  const handleSendOTP = async () => {
    setLoading(true);
    try {
      await sendOTP(phone);
      router.push('/verify-otp');
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = async () => {
    await createGuestSession();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to 1POS</Text>
      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TouchableOpacity
        style={styles.button}
        onPress={handleSendOTP}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleGuestMode}>
        <Text style={styles.guestText}>Continue as Guest</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#0ea5e9',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  guestText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#6b7280',
  },
});
```

---

## Step 6: Booking Flow Implementation

### Booking Service

Create `lib/services/bookingService.ts`:

```typescript
import { bookingAPI } from '@/lib/api/bookings';

export const bookingService = {
  async getAvailableTimeSlots(date: string, staffId?: string) {
    const response = await bookingAPI.getTimeSlots(date, staffId);
    return response.data;
  },

  async createBooking(bookingData: {
    serviceName: string;
    startTime: string;
    duration: number;
    staffId?: string;
    notes?: string;
  }) {
    const response = await bookingAPI.createBooking(bookingData);
    return response.data;
  },

  async getMyBookings(status?: string) {
    const response = await bookingAPI.getMyBookings(status);
    return response.data;
  },
};
```

### Booking Creation Screen

Create `app/booking/create.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { bookingService } from '@/lib/services/bookingService';

export default function CreateBookingScreen() {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  const handleDateSelect = async (date: string) => {
    setSelectedDate(date);
    const slots = await bookingService.getAvailableTimeSlots(date);
    setTimeSlots(slots);
  };

  const handleCreateBooking = async () => {
    await bookingService.createBooking({
      serviceName: 'Haircut',
      startTime: `${selectedDate}T${selectedTime}`,
      duration: 60,
    });
  };

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={(day) => handleDateSelect(day.dateString)}
        markedDates={{
          [selectedDate]: { selected: true },
        }}
      />
      {/* Time slot selection */}
      {/* Service selection */}
      {/* Confirm button */}
    </View>
  );
}
```

---

## Step 7: Product Ordering Implementation

### Cart Store

Create `store/cartStore.ts` (see specification for full implementation).

### Product Screen

Create `app/(tabs)/products.tsx`:

```typescript
import { useQuery } from 'react-query';
import { View, FlatList, StyleSheet } from 'react-native';
import { productAPI } from '@/lib/api/products';
import { ProductCard } from '@/components/product/ProductCard';

export default function ProductsScreen() {
  const { data, isLoading } = useQuery('products', () =>
    productAPI.getProducts()
  );

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data?.data || []}
        renderItem={({ item }) => <ProductCard product={item} />}
        keyExtractor={(item) => item._id}
        numColumns={2}
      />
    </View>
  );
}
```

---

## Step 8: Testing

### Run Development Server

```bash
# Start Expo
npx expo start

# Run on iOS
npx expo start --ios

# Run on Android
npx expo start --android
```

### Run Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

---

## Step 9: Build for Production

### Configure EAS

```bash
# Initialize EAS
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

### Submit to Stores

```bash
# Submit to App Store
eas submit --platform ios

# Submit to Play Store
eas submit --platform android
```

---

## Common Issues & Solutions

### Issue: API Connection Failed
**Solution:** Check API_BASE_URL in config and ensure backend is running.

### Issue: Token Not Persisting
**Solution:** Ensure SecureStore is properly configured and permissions are granted.

### Issue: Navigation Not Working
**Solution:** Ensure Expo Router is properly configured in app.json.

### Issue: Images Not Loading
**Solution:** Use expo-image instead of Image component and ensure proper image URLs.

---

## Next Steps

1. Implement remaining screens according to specification
2. Add error handling and loading states
3. Implement offline support
4. Add analytics
5. Performance optimization
6. Beta testing
7. App store submission

---

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [React Query Documentation](https://tanstack.com/query/latest)

---

**Last Updated:** 2024
