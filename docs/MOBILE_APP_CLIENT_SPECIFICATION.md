# 1POS Mobile App - Client-Grade Specification

## 📱 Executive Summary

This document provides comprehensive specifications for developing a **production-ready, client-grade mobile application** that enables customers to book services, order products/food, and manage their interactions with businesses powered by the 1POS system.

**Target Platforms:** iOS & Android  
**Framework:** React Native (Expo)  
**Target Audience:** End customers of businesses using 1POS  
**Quality Standard:** Production-ready, App Store/Play Store ready

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Core Features](#core-features)
4. [User Flows](#user-flows)
5. [Screen Specifications](#screen-specifications)
6. [API Integration](#api-integration)
7. [State Management](#state-management)
8. [UI/UX Design System](#uiux-design-system)
9. [Authentication & Security](#authentication--security)
10. [Performance Requirements](#performance-requirements)
11. [Implementation Phases](#implementation-phases)
12. [Testing Strategy](#testing-strategy)
13. [Deployment & Distribution](#deployment--distribution)

---

## 🏗️ Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Mobile App (React Native/Expo)              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   UI Layer   │  │  State Mgmt  │  │  API Client  │ │
│  │  (Screens)   │  │  (Zustand)   │  │  (Axios)     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                  │                  │          │
│  ┌──────▼──────────────────▼──────────────────▼──────┐ │
│  │           Business Logic Layer                     │ │
│  │  - Booking Service  - Cart Service                │ │
│  │  - Order Service    - Auth Service                 │ │
│  └───────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Storage    │  │  Navigation   │  │  Analytics   │ │
│  │ (SecureStore)│  │ (Expo Router) │  │  (Optional)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        │ HTTPS/REST API
                        │
┌───────────────────────▼─────────────────────────────────┐
│           1POS Backend (Next.js API Routes)               │
│  - Authentication  - Bookings  - Products                 │
│  - Orders          - Payments  - Notifications            │
└──────────────────────────────────────────────────────────┘
```

### Project Structure

```
mobile-app/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/                   # Authentication stack
│   │   ├── _layout.tsx
│   │   ├── login.tsx             # Phone OTP / Email login
│   │   ├── register.tsx          # Registration
│   │   └── verify-otp.tsx        # OTP verification
│   │
│   ├── (tabs)/                   # Main app tabs
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # Home/Dashboard
│   │   ├── services.tsx          # Browse services
│   │   ├── products.tsx          # Browse products/food
│   │   ├── bookings.tsx          # My bookings
│   │   ├── orders.tsx             # My orders
│   │   └── profile.tsx            # Profile & settings
│   │
│   ├── booking/                  # Booking flows
│   │   ├── create.tsx            # Create booking
│   │   ├── [id].tsx              # Booking details
│   │   └── calendar.tsx          # Calendar view
│   │
│   ├── product/                  # Product flows
│   │   ├── [id].tsx              # Product details
│   │   └── category/[id].tsx     # Category view
│   │
│   ├── cart/                     # Shopping cart
│   │   ├── index.tsx             # Cart view
│   │   └── checkout.tsx          # Checkout flow
│   │
│   └── order/                     # Order management
│       ├── [id].tsx              # Order details
│       └── tracking.tsx          # Order tracking
│
├── components/                    # Reusable components
│   ├── common/                   # Common UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Loading.tsx
│   │   └── ErrorBoundary.tsx
│   │
│   ├── booking/                  # Booking components
│   │   ├── BookingCard.tsx
│   │   ├── TimeSlotPicker.tsx
│   │   ├── ServiceSelector.tsx
│   │   └── BookingCalendar.tsx
│   │
│   ├── product/                  # Product components
│   │   ├── ProductCard.tsx
│   │   ├── ProductGrid.tsx
│   │   ├── ProductDetail.tsx
│   │   ├── CategoryFilter.tsx
│   │   └── ImageGallery.tsx
│   │
│   ├── cart/                     # Cart components
│   │   ├── CartItem.tsx
│   │   ├── CartSummary.tsx
│   │   └── PaymentMethod.tsx
│   │
│   └── layout/                  # Layout components
│       ├── Header.tsx
│       ├── TabBar.tsx
│       └── SafeArea.tsx
│
├── lib/                          # Utilities & services
│   ├── api/                      # API client
│   │   ├── client.ts            # Axios instance
│   │   ├── auth.ts              # Auth endpoints
│   │   ├── bookings.ts          # Booking endpoints
│   │   ├── products.ts           # Product endpoints
│   │   ├── orders.ts             # Order endpoints
│   │   └── types.ts              # API types
│   │
│   ├── services/                 # Business logic
│   │   ├── bookingService.ts
│   │   ├── cartService.ts
│   │   ├── orderService.ts
│   │   └── notificationService.ts
│   │
│   ├── storage/                  # Storage utilities
│   │   ├── secureStore.ts       # Secure token storage
│   │   └── asyncStorage.ts      # Local storage
│   │
│   ├── utils/                    # Helper functions
│   │   ├── date.ts
│   │   ├── currency.ts
│   │   ├── validation.ts
│   │   └── formatting.ts
│   │
│   └── hooks/                    # Custom hooks
│       ├── useAuth.ts
│       ├── useBookings.ts
│       ├── useCart.ts
│       └── useProducts.ts
│
├── store/                        # State management (Zustand)
│   ├── authStore.ts
│   ├── bookingStore.ts
│   ├── cartStore.ts
│   ├── productStore.ts
│   └── userStore.ts
│
├── types/                        # TypeScript types
│   ├── booking.ts
│   ├── product.ts
│   ├── order.ts
│   └── user.ts
│
├── constants/                    # App constants
│   ├── colors.ts
│   ├── spacing.ts
│   ├── typography.ts
│   └── config.ts
│
├── assets/                       # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── app.json                      # Expo configuration
├── package.json
└── tsconfig.json
```

---

## 🛠️ Technology Stack

### Core Framework
- **React Native** (via Expo SDK 50+)
- **Expo Router** (file-based routing)
- **TypeScript** (strict mode)

### State Management
- **Zustand** (lightweight, performant)
- **React Query** (server state, caching)

### API & Networking
- **Axios** (HTTP client)
- **React Query** (data fetching, caching)

### Storage
- **Expo SecureStore** (tokens, sensitive data)
- **AsyncStorage** (non-sensitive data, cache)

### UI Components
- **React Native Paper** or **NativeBase** (component library)
- **React Native Reanimated** (animations)
- **React Native Gesture Handler** (gestures)

### Forms & Validation
- **React Hook Form** (form management)
- **Zod** (schema validation)

### Date & Time
- **date-fns** (date manipulation)
- **react-native-calendars** (calendar component)

### Image Handling
- **expo-image** (optimized images)
- **react-native-fast-image** (caching)

### Navigation
- **Expo Router** (file-based routing)
- **React Navigation** (underlying navigation)

### Development Tools
- **ESLint** (linting)
- **Prettier** (formatting)
- **TypeScript** (type checking)

### Testing
- **Jest** (unit testing)
- **React Native Testing Library** (component testing)
- **Detox** (E2E testing)

---

## ✨ Core Features

### 1. Authentication & Onboarding

#### Features
- **Phone OTP Authentication**
  - Enter phone number
  - Receive 6-digit OTP via SMS
  - Verify OTP
  - Auto-register new users

- **Email/Password Authentication**
  - Email registration
  - Password login
  - Password reset flow

- **Guest Mode**
  - Browse without account
  - Limited functionality
  - Easy upgrade to account

- **Onboarding Flow**
  - Welcome screens
  - Feature highlights
  - Permission requests
  - Business selection (if multi-tenant)

#### User Flow
```
Launch App
    ↓
[Onboarding] (First time)
    ↓
[Login/Register/Guest]
    ↓
[OTP Verification] (if phone)
    ↓
[Home Dashboard]
```

### 2. Service Booking

#### Features
- **Browse Services**
  - Service categories
  - Service listings with descriptions
  - Pricing information
  - Duration display
  - Staff availability

- **Create Booking**
  - Select service
  - Choose date & time
  - View available time slots
  - Select staff member (optional)
  - Add notes/special requests
  - Confirm booking

- **Manage Bookings**
  - View upcoming bookings
  - View past bookings
  - Cancel bookings
  - Reschedule bookings
  - View booking details
  - Receive reminders

- **Calendar Integration**
  - Calendar view
  - Available time slots
  - Conflict detection
  - Business hours display

#### User Flow
```
[Services Tab]
    ↓
[Select Service]
    ↓
[Choose Date]
    ↓
[Select Time Slot]
    ↓
[Select Staff] (optional)
    ↓
[Add Notes] (optional)
    ↓
[Review & Confirm]
    ↓
[Booking Confirmed]
    ↓
[Booking Details]
```

### 3. Product/Food Ordering

#### Features
- **Browse Products**
  - Product categories
  - Product listings
  - Product details (images, description, price)
  - Search functionality
  - Filter by category, price, availability
  - Product variations (sizes, options)

- **Shopping Cart**
  - Add/remove items
  - Update quantities
  - Apply discount codes
  - View cart summary
  - Save for later

- **Checkout Flow**
  - Review order
  - Select delivery/pickup
  - Add delivery address
  - Select payment method
  - Apply discount codes
  - Confirm order

- **Order Management**
  - View order history
  - Track order status
  - View order details
  - Reorder items
  - Cancel orders (if allowed)

#### User Flow
```
[Products Tab]
    ↓
[Browse Products]
    ↓
[View Product Details]
    ↓
[Add to Cart]
    ↓
[View Cart]
    ↓
[Proceed to Checkout]
    ↓
[Select Delivery Method]
    ↓
[Add Address] (if delivery)
    ↓
[Select Payment Method]
    ↓
[Review & Confirm]
    ↓
[Order Placed]
    ↓
[Order Tracking]
```

### 4. Profile & Settings

#### Features
- **Profile Management**
  - View/edit profile
  - Update contact information
  - Change password
  - Profile picture

- **Address Management**
  - Add/edit addresses
  - Set default address
  - Delete addresses

- **Preferences**
  - Notification settings
  - Language selection
  - Theme preferences

- **Account Management**
  - View account information
  - Delete account
  - Logout

### 5. Notifications

#### Features
- **Push Notifications**
  - Booking reminders
  - Order updates
  - Promotional offers
  - System notifications

- **In-App Notifications**
  - Notification center
  - Mark as read
  - Notification history

---

## 🎨 Screen Specifications

### 1. Authentication Screens

#### Login Screen
- **Layout:**
  - Logo/Branding (top)
  - Welcome message
  - Phone number input (with country code)
  - "Continue" button
  - "Continue as Guest" option
  - "Sign up" link

- **Functionality:**
  - Phone number validation
  - Send OTP on continue
  - Guest mode access

#### OTP Verification Screen
- **Layout:**
  - Phone number display
  - 6-digit OTP input (auto-focus)
  - Resend OTP button (with countdown)
  - "Verify" button
  - Back to login

- **Functionality:**
  - Auto-submit on 6 digits
  - Resend OTP (60s cooldown)
  - Error handling

#### Registration Screen
- **Layout:**
  - Form fields:
    - First name
    - Last name
    - Email (optional)
    - Phone number
    - Password (if email provided)
  - "Create Account" button
  - Terms & conditions checkbox

### 2. Home/Dashboard Screen

#### Layout
- **Header:**
  - Greeting (e.g., "Good morning, John")
  - Notification icon
  - Profile icon

- **Quick Actions:**
  - Book a service (card)
  - Browse products (card)
  - View bookings (card)
  - View orders (card)

- **Featured Content:**
  - Featured services (carousel)
  - Featured products (grid)
  - Promotional banners

- **Recent Activity:**
  - Upcoming bookings
  - Recent orders

### 3. Services Screen

#### Layout
- **Header:**
  - Search bar
  - Filter button

- **Categories:**
  - Horizontal scrollable categories
  - "All" category

- **Service List:**
  - Service cards:
    - Service image
    - Service name
    - Duration
    - Price
    - "Book Now" button

- **Empty State:**
  - No services message
  - Illustration

### 4. Booking Creation Screen

#### Layout
- **Service Info:**
  - Service image
  - Service name
  - Description
  - Duration
  - Price

- **Date Selection:**
  - Calendar picker
  - Available dates highlighted

- **Time Slot Selection:**
  - Available time slots (grid)
  - Selected slot highlighted
  - Unavailable slots disabled

- **Staff Selection** (optional):
  - Staff list with avatars
  - "Any available" option

- **Additional Info:**
  - Notes text input
  - Special requests

- **Summary:**
  - Selected date & time
  - Service details
  - Total price

- **Action Button:**
  - "Confirm Booking" (disabled until all required fields filled)

### 5. Products Screen

#### Layout
- **Header:**
  - Search bar
  - Filter button
  - Cart icon (with badge)

- **Categories:**
  - Category chips (horizontal scroll)

- **Product Grid:**
  - Product cards:
    - Product image
    - Product name
    - Price
    - "Add to Cart" button
    - Out of stock indicator

- **Product Card States:**
  - Available
  - Out of stock
  - Low stock

### 6. Product Details Screen

#### Layout
- **Image Gallery:**
  - Main image (swipeable)
  - Thumbnail images

- **Product Info:**
  - Product name
  - Price
  - Description
  - Category
  - Availability status

- **Variations** (if applicable):
  - Size selector
  - Options selector
  - Quantity selector

- **Actions:**
  - "Add to Cart" button
  - "Buy Now" button

### 7. Shopping Cart Screen

#### Layout
- **Cart Items:**
  - Item cards:
    - Product image
    - Product name
    - Variation details
    - Price
    - Quantity selector
    - Remove button
    - Subtotal

- **Summary:**
  - Subtotal
  - Discount (if applied)
  - Tax
  - Delivery fee (if applicable)
  - Total

- **Discount Code:**
  - Input field
  - "Apply" button

- **Actions:**
  - "Continue Shopping" button
  - "Proceed to Checkout" button

### 8. Checkout Screen

#### Layout
- **Delivery Method:**
  - Pickup option
  - Delivery option (if available)

- **Delivery Address** (if delivery):
  - Address selector
  - "Add New Address" button
  - Address form (if adding)

- **Payment Method:**
  - Cash on delivery
  - Card payment (if integrated)
  - Digital wallet (if available)

- **Order Summary:**
  - Items list
  - Subtotal
  - Discount
  - Tax
  - Delivery fee
  - Total

- **Actions:**
  - "Place Order" button

### 9. Bookings Screen

#### Layout
- **Tabs:**
  - Upcoming
  - Past
  - Cancelled

- **Booking Cards:**
  - Service name
  - Date & time
  - Status badge
  - Staff name (if assigned)
  - Actions (view, cancel, reschedule)

- **Empty State:**
  - No bookings message
  - "Book a Service" CTA

### 10. Orders Screen

#### Layout
- **Tabs:**
  - Active
  - Completed
  - Cancelled

- **Order Cards:**
  - Order number
  - Date
  - Items count
  - Total amount
  - Status badge
  - "View Details" button

### 11. Profile Screen

#### Layout
- **Profile Header:**
  - Profile picture
  - Name
  - Email
  - Phone

- **Menu Items:**
  - My Bookings
  - My Orders
  - Addresses
  - Payment Methods
  - Notifications
  - Settings
  - Help & Support
  - Logout

---

## 🔌 API Integration

### Base Configuration

```typescript
// lib/api/client.ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.1pos.com/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('customer-auth-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add tenant slug if available
  const tenantSlug = await SecureStore.getItemAsync('tenant-slug');
  if (tenantSlug) {
    config.params = { ...config.params, tenant: tenantSlug };
  }
  
  return config;
});

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - clear token and redirect to login
      await SecureStore.deleteItemAsync('customer-auth-token');
      // Navigate to login
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Authentication APIs

```typescript
// lib/api/auth.ts
import apiClient from './client';

export const authAPI = {
  // Send OTP
  sendOTP: async (phone: string, tenantSlug?: string) => {
    const response = await apiClient.post('/auth/customer/send-otp', {
      phone,
      tenantSlug,
    });
    return response.data;
  },

  // Verify OTP
  verifyOTP: async (phone: string, otp: string, firstName?: string, lastName?: string, tenantSlug?: string) => {
    const response = await apiClient.post('/auth/customer/verify-otp', {
      phone,
      otp,
      firstName,
      lastName,
      tenantSlug,
    });
    return response.data;
  },

  // Register with email/password
  register: async (email: string, password: string, firstName: string, lastName: string, phone?: string, tenantSlug?: string) => {
    const response = await apiClient.post('/auth/customer/register', {
      email,
      password,
      firstName,
      lastName,
      phone,
      tenantSlug,
    });
    return response.data;
  },

  // Login with email/password
  login: async (email: string, password: string, tenantSlug?: string) => {
    const response = await apiClient.post('/auth/customer/login', {
      email,
      password,
      tenantSlug,
    });
    return response.data;
  },

  // Get current customer
  getMe: async () => {
    const response = await apiClient.get('/auth/customer/me');
    return response.data;
  },

  // Logout
  logout: async () => {
    const response = await apiClient.post('/auth/customer/logout');
    return response.data;
  },

  // Create guest session
  createGuestSession: async (tenantSlug?: string) => {
    const response = await apiClient.post('/auth/guest/create', {
      tenantSlug,
    });
    return response.data;
  },
};
```

### Booking APIs

```typescript
// lib/api/bookings.ts
import apiClient from './client';

export const bookingAPI = {
  // Get available time slots
  getTimeSlots: async (date: string, staffId?: string, duration?: number) => {
    const response = await apiClient.get('/bookings/time-slots', {
      params: { date, staffId, duration },
    });
    return response.data;
  },

  // Create booking
  createBooking: async (bookingData: {
    serviceName: string;
    startTime: string;
    duration: number;
    staffId?: string;
    notes?: string;
  }) => {
    const response = await apiClient.post('/bookings', bookingData);
    return response.data;
  },

  // Get customer bookings
  getMyBookings: async (status?: string) => {
    const response = await apiClient.get('/bookings/customer/me', {
      params: { status },
    });
    return response.data;
  },

  // Get booking details
  getBooking: async (id: string) => {
    const response = await apiClient.get(`/bookings/${id}`);
    return response.data;
  },

  // Cancel booking
  cancelBooking: async (id: string) => {
    const response = await apiClient.delete(`/bookings/${id}`);
    return response.data;
  },

  // Update booking
  updateBooking: async (id: string, updates: Partial<Booking>) => {
    const response = await apiClient.put(`/bookings/${id}`, updates);
    return response.data;
  },
};
```

### Product APIs

```typescript
// lib/api/products.ts
import apiClient from './client';

export const productAPI = {
  // Get products
  getProducts: async (params?: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/products', { params });
    return response.data;
  },

  // Get product details
  getProduct: async (id: string) => {
    const response = await apiClient.get(`/products/${id}`);
    return response.data;
  },

  // Get categories
  getCategories: async () => {
    const response = await apiClient.get('/categories');
    return response.data;
  },
};
```

### Order APIs

```typescript
// lib/api/orders.ts
import apiClient from './client';

export const orderAPI = {
  // Create order (transaction)
  createOrder: async (orderData: {
    items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>;
    deliveryMethod: 'pickup' | 'delivery';
    addressId?: string;
    paymentMethod: string;
    discountCode?: string;
  }) => {
    const response = await apiClient.post('/transactions', orderData);
    return response.data;
  },

  // Get customer orders
  getMyOrders: async (status?: string) => {
    const response = await apiClient.get('/transactions/customer/me', {
      params: { status },
    });
    return response.data;
  },

  // Get order details
  getOrder: async (id: string) => {
    const response = await apiClient.get(`/transactions/${id}`);
    return response.data;
  },
};
```

---

## 📦 State Management

### Zustand Stores

#### Auth Store

```typescript
// store/authStore.ts
import { create } from 'zustand';
import { authAPI } from '@/lib/api/auth';
import * as SecureStore from 'expo-secure-store';

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

interface AuthState {
  customer: Customer | null;
  guest: { guestId: string; tenantId: string } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  
  // Actions
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  loginWithOTP: (phone: string, otp: string, firstName?: string, lastName?: string, tenantSlug?: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string, phone?: string, tenantSlug?: string) => Promise<void>;
  createGuestSession: (tenantSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  customer: null,
  guest: null,
  isLoading: true,
  isAuthenticated: false,
  isGuest: false,

  login: async (email, password, tenantSlug) => {
    try {
      const response = await authAPI.login(email, password, tenantSlug);
      if (response.success) {
        await SecureStore.setItemAsync('customer-auth-token', response.data.token);
        set({ customer: response.data.customer, isAuthenticated: true, isGuest: false, guest: null });
      }
    } catch (error) {
      throw error;
    }
  },

  loginWithOTP: async (phone, otp, firstName, lastName, tenantSlug) => {
    try {
      const response = await authAPI.verifyOTP(phone, otp, firstName, lastName, tenantSlug);
      if (response.success) {
        await SecureStore.setItemAsync('customer-auth-token', response.data.token);
        set({ customer: response.data.customer, isAuthenticated: true, isGuest: false, guest: null });
      }
    } catch (error) {
      throw error;
    }
  },

  register: async (email, password, firstName, lastName, phone, tenantSlug) => {
    try {
      const response = await authAPI.register(email, password, firstName, lastName, phone, tenantSlug);
      if (response.success) {
        await SecureStore.setItemAsync('customer-auth-token', response.data.token);
        set({ customer: response.data.customer, isAuthenticated: true, isGuest: false, guest: null });
      }
    } catch (error) {
      throw error;
    }
  },

  createGuestSession: async (tenantSlug) => {
    try {
      const response = await authAPI.createGuestSession(tenantSlug);
      if (response.success) {
        await SecureStore.setItemAsync('guest-token', response.data.token);
        set({ guest: response.data, isGuest: true, isAuthenticated: false, customer: null });
      }
    } catch (error) {
      throw error;
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
      await SecureStore.deleteItemAsync('customer-auth-token');
      await SecureStore.deleteItemAsync('guest-token');
      set({ customer: null, guest: null, isAuthenticated: false, isGuest: false });
    } catch (error) {
      // Clear local state even if API call fails
      await SecureStore.deleteItemAsync('customer-auth-token');
      await SecureStore.deleteItemAsync('guest-token');
      set({ customer: null, guest: null, isAuthenticated: false, isGuest: false });
    }
  },

  checkAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync('customer-auth-token');
      if (token) {
        const response = await authAPI.getMe();
        if (response.success) {
          set({ customer: response.customer, isAuthenticated: true, isGuest: false, isLoading: false });
          return;
        }
      }
      
      const guestToken = await SecureStore.getItemAsync('guest-token');
      if (guestToken) {
        // Verify guest session
        set({ isGuest: true, isLoading: false });
        return;
      }
      
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
    }
  },
}));
```

#### Cart Store

```typescript
// store/cartStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  image?: string;
  variations?: Record<string, string>;
}

interface CartState {
  items: CartItem[];
  discountCode: string | null;
  discountAmount: number;
  
  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  applyDiscount: (code: string, amount: number) => void;
  removeDiscount: () => void;
  
  // Computed
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discountCode: null,
      discountAmount: 0,

      addItem: (item) => {
        const existingItem = get().items.find(
          (i) => i.productId === item.productId
        );
        
        if (existingItem) {
          set({
            items: get().items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          });
        } else {
          set({ items: [...get().items, item] });
        }
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
        } else {
          set({
            items: get().items.map((i) =>
              i.productId === productId ? { ...i, quantity } : i
            ),
          });
        }
      },

      clearCart: () => {
        set({ items: [], discountCode: null, discountAmount: 0 });
      },

      applyDiscount: (code, amount) => {
        set({ discountCode: code, discountAmount: amount });
      },

      removeDiscount: () => {
        set({ discountCode: null, discountAmount: 0 });
      },

      getTotal: () => {
        const subtotal = get().items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        return subtotal - get().discountAmount;
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

---

## 🎨 UI/UX Design System

### Color Palette

```typescript
// constants/colors.ts
export const colors = {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    500: '#0ea5e9',  // Main brand color
    600: '#0284c7',
    700: '#0369a1',
  },
  secondary: {
    500: '#8b5cf6',
    600: '#7c3aed',
  },
  success: {
    500: '#10b981',
    600: '#059669',
  },
  error: {
    500: '#ef4444',
    600: '#dc2626',
  },
  warning: {
    500: '#f59e0b',
    600: '#d97706',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  background: '#ffffff',
  surface: '#f9fafb',
  text: {
    primary: '#111827',
    secondary: '#6b7280',
    disabled: '#9ca3af',
  },
};
```

### Typography

```typescript
// constants/typography.ts
export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  small: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
};
```

### Spacing

```typescript
// constants/spacing.ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};
```

### Component Guidelines

1. **Buttons**
   - Primary: Full width, rounded, primary color
   - Secondary: Outlined, secondary color
   - Text: Text-only, minimal styling

2. **Cards**
   - Rounded corners (12px)
   - Shadow for elevation
   - Padding: 16px

3. **Inputs**
   - Rounded corners (8px)
   - Border: 1px solid gray-300
   - Focus: Border color changes to primary

4. **Loading States**
   - Skeleton loaders for content
   - Spinner for actions

5. **Error States**
   - Clear error messages
   - Retry actions
   - Helpful guidance

---

## 🔒 Authentication & Security

### Security Measures

1. **Token Storage**
   - Use Expo SecureStore for sensitive data
   - Tokens expire after 30 days
   - Automatic token refresh

2. **API Security**
   - HTTPS only
   - Token-based authentication
   - Request signing (optional)

3. **Data Protection**
   - Encrypt sensitive data
   - Secure payment information
   - GDPR compliance

4. **Input Validation**
   - Client-side validation
   - Server-side validation
   - Sanitize user inputs

---

## ⚡ Performance Requirements

### Targets

- **App Launch:** < 2 seconds
- **Screen Navigation:** < 300ms
- **API Response:** < 1 second (with loading states)
- **Image Loading:** Progressive loading, caching
- **Offline Support:** Basic offline functionality

### Optimization Strategies

1. **Code Splitting**
   - Lazy load screens
   - Dynamic imports

2. **Image Optimization**
   - Use optimized image formats
   - Implement caching
   - Lazy load images

3. **API Optimization**
   - Implement caching
   - Batch requests
   - Use pagination

4. **Bundle Size**
   - Tree shaking
   - Remove unused dependencies
   - Optimize assets

---

## 📅 Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Project setup
- [ ] Authentication flow
- [ ] Basic navigation
- [ ] API client setup
- [ ] State management

### Phase 2: Core Features (Weeks 3-5)
- [ ] Service booking flow
- [ ] Product browsing
- [ ] Shopping cart
- [ ] Basic checkout

### Phase 3: Enhanced Features (Weeks 6-7)
- [ ] Order management
- [ ] Booking management
- [ ] Profile & settings
- [ ] Notifications

### Phase 4: Polish & Testing (Weeks 8-9)
- [ ] UI/UX refinements
- [ ] Performance optimization
- [ ] Testing (unit, integration, E2E)
- [ ] Bug fixes

### Phase 5: Launch Preparation (Week 10)
- [ ] App store preparation
- [ ] Beta testing
- [ ] Documentation
- [ ] Launch

---

## 🧪 Testing Strategy

### Unit Tests
- Component tests
- Utility function tests
- Store tests

### Integration Tests
- API integration
- Navigation flows
- State management

### E2E Tests
- Critical user flows
- Booking flow
- Ordering flow

### Manual Testing
- Device testing (iOS & Android)
- Network conditions
- Edge cases

---

## 🚀 Deployment & Distribution

### App Store Preparation

1. **iOS (App Store)**
   - App Store Connect setup
   - App icons & screenshots
   - Privacy policy
   - App description

2. **Android (Play Store)**
   - Google Play Console setup
   - App icons & screenshots
   - Privacy policy
   - App description

### Build Process

```bash
# Development build
expo start --dev-client

# Production build (iOS)
eas build --platform ios

# Production build (Android)
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

---

## 📝 Additional Considerations

### Accessibility
- Screen reader support
- High contrast mode
- Font scaling
- Touch target sizes (min 44x44px)

### Internationalization
- Multi-language support
- RTL support
- Date/time formatting
- Currency formatting

### Analytics
- User behavior tracking
- Error tracking
- Performance monitoring
- Conversion tracking

### Support
- In-app help
- FAQ section
- Contact support
- Feedback mechanism

---

## 📚 Conclusion

This specification provides a comprehensive blueprint for developing a production-ready, client-grade mobile application. The app will enable customers to seamlessly book services, order products/food, and manage their interactions with businesses using the 1POS system.

**Key Success Factors:**
- Clean, intuitive UI/UX
- Reliable performance
- Secure authentication
- Seamless booking & ordering flows
- Excellent user experience

**Next Steps:**
1. Review and approve specification
2. Set up development environment
3. Begin Phase 1 implementation
4. Regular progress reviews

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** Ready for Implementation
