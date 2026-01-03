# LocalPro POS - Mobile App Specifications (Expo)

## Overview

This document provides complete specifications for developing a client-facing mobile application using **Expo** that integrates with the LocalPro POS system. The mobile app enables customers to book services, order products, manage their bookings, and interact with businesses seamlessly.

---

## Table of Contents

1. [App Architecture](#app-architecture)
2. [Technology Stack](#technology-stack)
3. [Core Features](#core-features)
4. [API Integration](#api-integration)
5. [Screen Specifications](#screen-specifications)
6. [Mobile Layouts & Wireframes](#mobile-layouts--wireframes)
7. [Data Models](#data-models)
8. [Authentication Flow](#authentication-flow)
9. [State Management](#state-management)
10. [Navigation Structure](#navigation-structure)
11. [UI/UX Guidelines](#uiux-guidelines)
12. [Implementation Phases](#implementation-phases)

---

## App Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────┐
│         Mobile App (Expo)               │
├─────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐            │
│  │  Auth    │  │  API     │            │
│  │  Context │  │  Client  │            │
│  └──────────┘  └──────────┘            │
│       │              │                  │
│       └──────┬───────┘                  │
│              │                           │
│       ┌──────▼──────┐                  │
│       │   Redux/    │                  │
│       │   Context   │                  │
│       │   Store     │                  │
│       └─────────────┘                  │
└─────────────────────────────────────────┘
              │
              │ HTTPS/REST API
              │
┌─────────────▼─────────────────────────┐
│      LocalPro POS Backend              │
│      (Next.js API Routes)              │
└─────────────────────────────────────────┘
```

### Project Structure

```
mobile-app/
├── app/                      # Expo Router app directory
│   ├── (auth)/              # Auth stack
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/              # Main app tabs
│   │   ├── index.tsx        # Home/Dashboard
│   │   ├── services.tsx     # Services/Products
│   │   ├── bookings.tsx     # My Bookings
│   │   ├── orders.tsx       # My Orders
│   │   └── profile.tsx      # Profile
│   ├── booking/
│   │   ├── [id].tsx         # Booking details
│   │   └── create.tsx       # Create booking
│   ├── product/
│   │   └── [id].tsx         # Product details
│   ├── cart.tsx             # Shopping cart
│   └── checkout.tsx         # Checkout
├── components/
│   ├── common/              # Reusable components
│   ├── booking/             # Booking components
│   ├── product/             # Product components
│   └── cart/               # Cart components
├── lib/
│   ├── api/                # API client
│   ├── auth/               # Auth utilities
│   ├── storage/            # Secure storage
│   └── utils/              # Utilities
├── contexts/               # React contexts
├── hooks/                  # Custom hooks
├── types/                  # TypeScript types
├── constants/              # App constants
└── assets/                 # Images, fonts, etc.
```

---

## Technology Stack

### Core Technologies

- **Framework**: Expo SDK 50+ (React Native)
- **Navigation**: Expo Router (file-based routing)
- **Language**: TypeScript
- **State Management**: React Context API + Zustand (or Redux Toolkit)
- **HTTP Client**: Axios or Fetch API
- **Storage**: Expo SecureStore
- **Forms**: React Hook Form + Zod validation
- **UI Components**: React Native Paper or NativeBase
- **Icons**: Expo Vector Icons
- **Date/Time**: date-fns or dayjs
- **Image Handling**: expo-image

### Additional Libraries

- **Push Notifications**: expo-notifications
- **Location**: expo-location (for store locator)
- **Camera**: expo-camera (for profile pictures)
- **Calendar**: react-native-calendars
- **Charts**: react-native-chart-kit (for order history)
- **Animations**: react-native-reanimated
- **Offline Support**: @react-native-async-storage/async-storage

---

## Core Features

### 1. Authentication & Onboarding

#### Features
- **SMS OTP Authentication (Twilio)**
  - Phone number input
  - OTP sent via SMS
  - 6-digit OTP verification
  - Auto-create customer account on first login
  - 10-minute OTP expiry
  - Rate limiting (1 OTP per minute)

- **Login Flow**
  1. Enter phone number
  2. Receive OTP via SMS
  3. Enter 6-digit OTP
  4. Auto-login with JWT token (30-day expiry)
  5. For new customers: Complete profile (first name, last name)

- **Guest Mode**
  - Browse products/services without account
  - Limited functionality (no bookings/orders)

- **Onboarding**
  - Welcome screens
  - Feature highlights
  - Permission requests (notifications, location, SMS)

### 2. Home/Dashboard

#### Features
- **Business Information**
  - Business name, logo, description
  - Contact information
  - Business hours
  - Location map

- **Quick Actions**
  - Book a service
  - Browse products
  - View my bookings
  - Contact business

- **Featured Content**
  - Featured products/services
  - Promotions/discounts
  - Announcements

- **Recent Activity**
  - Recent bookings
  - Recent orders
  - Notifications

### 3. Services & Products

#### Features
- **Service Listing**
  - List all available services
  - Filter by category
  - Search functionality
  - Service details (name, description, duration, price)
  - Book service directly

- **Product Catalog**
  - Product grid/list view
  - Category filtering
  - Search products
  - Product details (images, description, price, stock)
  - Add to cart
  - Product variations (size, color, etc.)

- **Categories**
  - Category navigation
  - Category-based filtering
  - Category images/icons

### 4. Booking System

#### Features
- **View Available Time Slots**
  - Calendar view
  - Available time slots per day
  - Staff selection (if applicable)
  - Duration selection

- **Create Booking**
  - Select service
  - Select date & time
  - Select staff (optional)
  - Add notes/special requests
  - Customer information (pre-filled if logged in)
  - Confirmation screen

- **My Bookings**
  - List of all bookings
  - Filter by status (pending, confirmed, completed, cancelled)
  - Booking details
  - Cancel booking (if allowed)
  - Reschedule booking (if allowed)
  - View booking history

- **Booking Notifications**
  - Booking confirmation
  - Reminder notifications (24h before)
  - Status change notifications
  - Cancellation notifications

### 5. Shopping Cart & Orders

#### Features
- **Shopping Cart**
  - Add/remove items
  - Quantity adjustment
  - Apply discount codes
  - Calculate totals (subtotal, tax, discount, total)
  - Save for later

- **Checkout**
  - Review cart items
  - Apply discount code
  - Select payment method (if online payment enabled)
  - Delivery/pickup options
  - Customer information
  - Order notes
  - Place order

- **My Orders**
  - Order history
  - Order details
  - Order status tracking
  - Receipt view
  - Reorder functionality

### 6. Customer Profile

#### Features
- **Profile Management**
  - View/edit personal information
  - Profile picture upload
  - Address management
  - Phone number management
  - Email management

- **Preferences**
  - Notification preferences
  - Language selection
  - Currency preferences

- **Account Settings**
  - Change password
  - Privacy settings
  - Delete account

- **Loyalty & Rewards** (if implemented)
  - Points balance
  - Rewards history
  - Redeem rewards

### 7. Notifications

#### Features
- **Push Notifications**
  - Booking confirmations
  - Booking reminders
  - Order updates
  - Promotions
  - System notifications

- **In-App Notifications**
  - Notification center
  - Mark as read
  - Notification history

### 8. Additional Features

- **Store Locator** (if multi-branch)
  - List of branches
  - Map view
  - Branch details
  - Directions

- **Reviews & Ratings** (future)
  - Rate services/products
  - Write reviews
  - View reviews

- **Favorites**
  - Save favorite products/services
  - Quick access

- **Search**
  - Global search
  - Search history
  - Search suggestions

---

## API Integration

### Base Configuration

```typescript
// lib/api/config.ts
export const API_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'https://your-domain.com/api',
  TIMEOUT: 30000,
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
};
```

### Authentication Endpoints

#### Customer Authentication (Twilio OTP)

#### Send OTP
```typescript
POST /api/auth/customer/send-otp
Body: {
  phone: string;
  tenantSlug: string;
}
Response: {
  success: true;
  message: "OTP sent successfully";
}
```

#### Verify OTP & Login
```typescript
POST /api/auth/customer/verify-otp
Body: {
  phone: string;
  otp: string;
  tenantSlug: string;
  firstName?: string;  // Required for new customers
  lastName?: string;   // Required for new customers
}
Response: {
  success: true;
  data: {
    customer: {
      _id: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone: string;
    };
    token: string;  // JWT token (30-day expiry)
  };
}
```

**Note**: Uses Twilio SMS for OTP delivery. See [MOBILE_AUTH_TWILIO.md](./MOBILE_AUTH_TWILIO.md) for details.

### Product Endpoints

```typescript
// Get all products
GET /api/products?tenantSlug={slug}&isActive=true

// Get product by ID
GET /api/products/{id}

// Search products
GET /api/products?search={query}&categoryId={id}
```

### Booking Endpoints

```typescript
// Get available time slots
GET /api/bookings/time-slots?date={ISO_DATE}&duration={minutes}&staffId={id}

// Create booking (customer or staff)
POST /api/bookings
Headers: { Authorization: 'Bearer {token}' }
Body: {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  startTime: string; // ISO date
  duration: number; // minutes
  staffId?: string;
  notes?: string;
}
// Note: If authenticated as customer, customer info is auto-filled

// Get customer bookings
GET /api/bookings/customer/{customerId}
Headers: { Authorization: 'Bearer {token}' }
Query: ?status={status}&startDate={date}&endDate={date}

// Cancel booking
PUT /api/bookings/{id}
Body: { status: 'cancelled' }
```

### Transaction/Order Endpoints

```typescript
// Create order
POST /api/transactions
Headers: { Authorization: 'Bearer {token}' }
Body: {
  items: Array<{
    product: string; // product ID
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  tax?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'online';
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
}
// Note: If authenticated as customer, customer info is auto-filled

// Get customer orders
GET /api/transactions/customer/{customerId}
Headers: { Authorization: 'Bearer {token}' }
Query: ?status={status}&startDate={date}&endDate={date}&page={page}&limit={limit}
```

### Customer Endpoints

```typescript
// Get customer profile
GET /api/customers/{id}

// Update customer profile
PUT /api/customers/{id}
Body: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    isDefault?: boolean;
  }>;
}
```

### Discount Endpoints

```typescript
// Validate discount code
POST /api/discounts/validate
Body: {
  code: string;
  amount: number;
}
```

---

## Screen Specifications

### Screen List

1. **Onboarding Screens** (3-4 screens)
2. **Login Screen**
3. **Register Screen**
4. **Home/Dashboard Screen**
5. **Services List Screen**
6. **Service Details Screen**
7. **Products List Screen**
8. **Product Details Screen**
9. **Booking Calendar Screen**
10. **Create Booking Screen**
11. **My Bookings Screen**
12. **Booking Details Screen**
13. **Shopping Cart Screen**
14. **Checkout Screen**
15. **My Orders Screen**
16. **Order Details Screen**
17. **Profile Screen**
18. **Edit Profile Screen**
19. **Settings Screen**
20. **Notifications Screen**

---

## Mobile Layouts & Wireframes

### 1. Onboarding Flow

```
┌─────────────────────┐
│                     │
│   [Illustration]    │
│                     │
│   Welcome Title     │
│   Description text  │
│                     │
│   [Skip] [Next →]   │
└─────────────────────┘
```

### 2. Login Screen

```
┌─────────────────────┐
│  ← Back             │
│                     │
│  [Business Logo]    │
│                     │
│  Welcome Back       │
│  Sign in to continue│
│                     │
│  ┌───────────────┐  │
│  │ Email         │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Password      │  │
│  │ [👁️]         │  │
│  └───────────────┘  │
│                     │
│  [ ] Remember me    │
│  Forgot password?   │
│                     │
│  ┌───────────────┐  │
│  │   Sign In     │  │
│  └───────────────┘  │
│                     │
│  Don't have account?│
│  Sign Up            │
│                     │
│  [Continue as Guest]│
└─────────────────────┘
```

### 3. Home/Dashboard Screen

```
┌─────────────────────┐
│ ☰ [Logo]      🔔 👤│
├─────────────────────┤
│                     │
│  [Business Name]    │
│  [Business Hours]   │
│  📍 [Address]       │
│                     │
│  ┌───────────────┐  │
│  │ 🔍 Search...  │  │
│  └───────────────┘  │
│                     │
│  Quick Actions:     │
│  ┌────┐ ┌────┐     │
│  │📅  │ │🛍️  │     │
│  │Book│ │Shop│     │
│  └────┘ └────┘     │
│                     │
│  Featured Services  │
│  ┌─────────────────┐│
│  │ [Image]         ││
│  │ Service Name    ││
│  │ $XX.XX          ││
│  └─────────────────┘│
│  [Scroll →]         │
│                     │
│  My Bookings        │
│  ┌─────────────────┐│
│  │ 📅 Today 10:00  ││
│  │ Haircut         ││
│  │ Status: Confirmed││
│  └─────────────────┘│
│                     │
│  Recent Orders      │
│  ┌─────────────────┐│
│  │ 🛍️ Order #123   ││
│  │ $XX.XX          ││
│  │ Status: Delivered││
│  └─────────────────┘│
│                     │
├─────────────────────┤
│ 🏠 📅 🛍️ 📋 👤    │
└─────────────────────┘
```

### 4. Services List Screen

```
┌─────────────────────┐
│ ← Services    🔍    │
├─────────────────────┤
│                     │
│  [All] [Hair] [Nail]│
│  [Massage] [Facial] │
│                     │
│  ┌─────────────────┐│
│  │ [Image]         ││
│  │ Haircut         ││
│  │ $25.00          ││
│  │ ⏱️ 30 min       ││
│  │ [Book Now]      ││
│  └─────────────────┘│
│                     │
│  ┌─────────────────┐│
│  │ [Image]         ││
│  │ Manicure        ││
│  │ $35.00          ││
│  │ ⏱️ 45 min       ││
│  │ [Book Now]      ││
│  └─────────────────┘│
│                     │
│  [Load More...]     │
│                     │
├─────────────────────┤
│ 🏠 📅 🛍️ 📋 👤    │
└─────────────────────┘
```

### 5. Service Details Screen

```
┌─────────────────────┐
│ ← [Image]           │
│                     │
│  Haircut            │
│  $25.00             │
│                     │
│  ⏱️ Duration: 30 min│
│  📍 Available at all│
│     locations       │
│                     │
│  Description:       │
│  Professional       │
│  haircut service... │
│                     │
│  ┌───────────────┐  │
│  │  Book Service │  │
│  └───────────────┘  │
│                     │
│  Reviews (4.5 ⭐)   │
│  ┌─────────────────┐│
│  │ John D. ⭐⭐⭐⭐⭐││
│  │ Great service!  ││
│  └─────────────────┘│
│                     │
└─────────────────────┘
```

### 6. Booking Calendar Screen

```
┌─────────────────────┐
│ ← Select Date & Time│
├─────────────────────┤
│                     │
│  Service: Haircut   │
│  Duration: 30 min   │
│                     │
│  ┌─────────────────┐│
│  │  Jan 2024       ││
│  │  S M T W T F S  ││
│  │     1  2  3  4 ││
│  │  5  6  7  8  9 10││
│  │ 11 12 13 14 15 16││
│  │ [17] 18 19 20...││
│  └─────────────────┘│
│                     │
│  Available Times:   │
│  ┌────┐ ┌────┐      │
│  │9:00│ │9:30│      │
│  └────┘ └────┘      │
│  ┌────┐ ┌────┐      │
│  │10:00││10:30│     │
│  └────┘ └────┘      │
│  ┌────┐ ┌────┐      │
│  │11:00││11:30│     │
│  └────┘ └────┘      │
│                     │
│  Select Staff:      │
│  ┌─────────────────┐│
│  │ [ ] Any         ││
│  │ [✓] John Smith  ││
│  │ [ ] Jane Doe    ││
│  └─────────────────┘│
│                     │
│  ┌───────────────┐  │
│  │   Continue    │  │
│  └───────────────┘  │
│                     │
└─────────────────────┘
```

### 7. Create Booking Screen

```
┌─────────────────────┐
│ ← Confirm Booking   │
├─────────────────────┤
│                     │
│  Booking Summary    │
│  ┌─────────────────┐│
│  │ Service: Haircut││
│  │ Date: Jan 17     ││
│  │ Time: 10:00 AM  ││
│  │ Staff: John S.  ││
│  │ Price: $25.00   ││
│  └─────────────────┘│
│                     │
│  Your Information   │
│  ┌───────────────┐  │
│  │ Full Name     │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Email         │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Phone         │  │
│  └───────────────┘  │
│                     │
│  Special Requests   │
│  ┌───────────────┐  │
│  │               │  │
│  │               │  │
│  └───────────────┘  │
│                     │
│  [ ] I agree to     │
│      terms & cond.  │
│                     │
│  ┌───────────────┐  │
│  │ Confirm Booking│ │
│  └───────────────┘  │
│                     │
└─────────────────────┘
```

### 8. My Bookings Screen

```
┌─────────────────────┐
│ ← My Bookings  🔍   │
├─────────────────────┤
│                     │
│  [All] [Upcoming]   │
│  [Past] [Cancelled]│
│                     │
│  ┌─────────────────┐│
│  │ 📅 Jan 17, 10:00││
│  │ Haircut         ││
│  │ Staff: John S.  ││
│  │ Status: ✓ Confirmed│
│  │ [View] [Cancel] ││
│  └─────────────────┘│
│                     │
│  ┌─────────────────┐│
│  │ 📅 Jan 20, 2:00 ││
│  │ Manicure        ││
│  │ Staff: Jane D.  ││
│  │ Status: ⏳ Pending│
│  │ [View] [Cancel] ││
│  └─────────────────┘│
│                     │
│  ┌─────────────────┐│
│  │ 📅 Jan 15, 3:00 ││
│  │ Facial          ││
│  │ Status: ✓ Completed│
│  │ [View] [Review] ││
│  └─────────────────┘│
│                     │
├─────────────────────┤
│ 🏠 📅 🛍️ 📋 👤    │
└─────────────────────┘
```

### 9. Products List Screen

```
┌─────────────────────┐
│ ← Products    🔍    │
├─────────────────────┤
│                     │
│  [Grid] [List]      │
│                     │
│  ┌────┐ ┌────┐     │
│  │[Img]│ │[Img]│     │
│  │Prod1│ │Prod2│     │
│  │$XX  │ │$XX  │     │
│  └────┘ └────┘     │
│  ┌────┐ ┌────┐     │
│  │[Img]│ │[Img]│     │
│  │Prod3│ │Prod4│     │
│  │$XX  │ │$XX  │     │
│  └────┘ └────┘     │
│                     │
│  Categories:        │
│  [All] [Category1] │
│  [Category2] [Cat3] │
│                     │
├─────────────────────┤
│ 🏠 📅 🛍️ 📋 👤    │
└─────────────────────┘
```

### 10. Shopping Cart Screen

```
┌─────────────────────┐
│ ← Shopping Cart     │
├─────────────────────┤
│                     │
│  ┌─────────────────┐│
│  │ [Image]         ││
│  │ Product Name    ││
│  │ $XX.XX          ││
│  │ [-] 2 [+]       ││
│  │ [Remove]        ││
│  └─────────────────┘│
│                     │
│  ┌─────────────────┐│
│  │ [Image]         ││
│  │ Product Name 2  ││
│  │ $XX.XX          ││
│  │ [-] 1 [+]       ││
│  │ [Remove]        ││
│  └─────────────────┘│
│                     │
│  Discount Code:     │
│  ┌───────────────┐  │
│  │ Enter code    │  │
│  │ [Apply]       │  │
│  └───────────────┘  │
│                     │
│  Summary:           │
│  Subtotal: $XX.XX   │
│  Discount: -$X.XX   │
│  Tax: $X.XX         │
│  ─────────────────  │
│  Total: $XX.XX      │
│                     │
│  ┌───────────────┐  │
│  │  Checkout    │  │
│  └───────────────┘  │
│                     │
└─────────────────────┘
```

### 11. Profile Screen

```
┌─────────────────────┐
│ ← Profile      ⚙️   │
├─────────────────────┤
│                     │
│      [Avatar]       │
│    John Doe         │
│  john@example.com   │
│                     │
│  ┌───────────────┐  │
│  │ Personal Info │  │
│  │ →             │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ My Bookings   │  │
│  │ →             │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ My Orders     │  │
│  │ →             │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Addresses     │  │
│  │ →             │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Notifications │  │
│  │ →             │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Settings      │  │
│  │ →             │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Logout        │  │
│  └───────────────┘  │
│                     │
├─────────────────────┤
│ 🏠 📅 🛍️ 📋 👤    │
└─────────────────────┘
```

---

## Data Models

### Customer Model (Mobile)

```typescript
interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  addresses?: Address[];
  dateOfBirth?: string;
  totalSpent?: number;
  lastPurchaseDate?: string;
  isActive: boolean;
}

interface Address {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isDefault?: boolean;
}
```

### Booking Model (Mobile)

```typescript
interface Booking {
  _id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  serviceDescription?: string;
  startTime: string; // ISO date
  endTime: string; // ISO date
  duration: number; // minutes
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  staffId?: string;
  staffName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Product Model (Mobile)

```typescript
interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  categoryId?: string;
  image?: string;
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations?: ProductVariation[];
  isActive: boolean;
}

interface ProductVariation {
  size?: string;
  color?: string;
  type?: string;
  sku?: string;
  price?: number;
  stock?: number;
}
```

### Order/Transaction Model (Mobile)

```typescript
interface Order {
  _id: string;
  receiptNumber: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount?: number;
  tax?: number;
  total: number;
  paymentMethod: string;
  status: 'completed' | 'cancelled' | 'refunded';
  customerEmail?: string;
  customerPhone?: string;
  createdAt: string;
}

interface OrderItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}
```

---

## Authentication Flow

### Registration Flow

```
1. User enters email, password, name
2. App validates input
3. POST /api/customers
4. If success → Auto login
5. Store token in SecureStore
6. Navigate to Home
```

### Login Flow

```
1. User enters email & password
2. POST /api/auth/customer-login
3. Receive JWT token
4. Store token in SecureStore
5. Store user data in context/state
6. Navigate to Home
```

### Token Management

```typescript
// lib/auth/token.ts
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'user_data';

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function removeToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
```

---

## State Management

### Recommended: Zustand

```typescript
// stores/authStore.ts
import create from 'zustand';
import { Customer } from '@/types';

interface AuthState {
  user: Customer | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: Customer) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  setToken: (token) => set({ token }),
  logout: () => set({ user: null, token: null, isAuthenticated: false }),
}));
```

### Cart Store

```typescript
// stores/cartStore.ts
interface CartItem {
  product: Product;
  quantity: number;
  variation?: ProductVariation;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity: number, variation?: ProductVariation) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (product, quantity, variation) => {
    // Implementation
  },
  removeItem: (productId) => {
    // Implementation
  },
  updateQuantity: (productId, quantity) => {
    // Implementation
  },
  clearCart: () => set({ items: [] }),
  getTotal: () => {
    // Calculate total
  },
}));
```

---

## Navigation Structure

### Tab Navigation (Bottom Tabs)

```
Home Tab
├── Dashboard
├── Service Details
└── Product Details

Bookings Tab
├── My Bookings
├── Booking Details
├── Create Booking
└── Booking Calendar

Shop Tab
├── Products List
├── Product Details
├── Shopping Cart
└── Checkout

Orders Tab
├── My Orders
└── Order Details

Profile Tab
├── Profile
├── Edit Profile
├── Settings
└── Addresses
```

### Stack Navigation

```
Auth Stack
├── Login
├── Register
└── Forgot Password

Main Stack
├── (Tabs)
│   ├── Home
│   ├── Bookings
│   ├── Shop
│   ├── Orders
│   └── Profile
└── Modal Screens
    ├── Booking Details
    ├── Product Details
    └── Order Details
```

---

## UI/UX Guidelines

### Design Principles

1. **Simplicity**: Clean, uncluttered interfaces
2. **Consistency**: Uniform design language throughout
3. **Accessibility**: WCAG 2.1 AA compliance
4. **Performance**: Fast load times, smooth animations
5. **Feedback**: Clear loading states, error messages

### Color Scheme

- **Primary**: Business brand color (from tenant settings)
- **Secondary**: Complementary color
- **Accent**: Highlight color for CTAs
- **Background**: Light gray (#F5F5F5)
- **Text**: Dark gray (#333333)
- **Success**: Green (#4CAF50)
- **Error**: Red (#F44336)
- **Warning**: Orange (#FF9800)

### Typography

- **Headings**: Bold, 18-24px
- **Body**: Regular, 14-16px
- **Small**: 12px
- **Font Family**: System default (San Francisco on iOS, Roboto on Android)

### Spacing

- **Padding**: 16px standard, 8px small, 24px large
- **Margin**: 8px, 16px, 24px, 32px
- **Border Radius**: 8px standard, 12px for cards

### Components

- **Buttons**: 
  - Primary: Full width, rounded, primary color
  - Secondary: Outlined, rounded
  - Text: Text only, no background

- **Cards**: 
  - White background
  - Shadow/elevation
  - Rounded corners (12px)
  - Padding: 16px

- **Input Fields**:
  - Label above input
  - Border on focus
  - Error message below
  - Clear validation feedback

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Project setup (Expo, TypeScript)
- [ ] Navigation structure
- [ ] Authentication flow
- [ ] API client setup
- [ ] State management
- [ ] Basic UI components

### Phase 2: Core Features (Weeks 3-4)
- [ ] Home/Dashboard
- [ ] Services listing
- [ ] Products listing
- [ ] Product details
- [ ] Shopping cart
- [ ] Basic checkout

### Phase 3: Booking System (Weeks 5-6)
- [ ] Booking calendar
- [ ] Time slot selection
- [ ] Create booking
- [ ] My bookings
- [ ] Booking details
- [ ] Cancel/reschedule

### Phase 4: Orders & Profile (Weeks 7-8)
- [ ] Order history
- [ ] Order details
- [ ] Profile management
- [ ] Address management
- [ ] Settings

### Phase 5: Polish & Testing (Weeks 9-10)
- [ ] Push notifications
- [ ] Offline support
- [ ] Error handling
- [ ] Loading states
- [ ] Testing
- [ ] Bug fixes
- [ ] Performance optimization

### Phase 6: Launch (Week 11+)
- [ ] App store submission
- [ ] Beta testing
- [ ] Final adjustments
- [ ] Production release

---

## Additional Considerations

### Security

- Store tokens in SecureStore
- Use HTTPS only
- Validate all inputs
- Implement certificate pinning (production)
- Secure API keys

### Performance

- Image optimization
- Lazy loading
- Code splitting
- Caching strategies
- Offline-first approach

### Testing

- Unit tests (Jest)
- Integration tests
- E2E tests (Detox)
- Manual testing on devices

### Analytics

- User behavior tracking
- Crash reporting (Sentry)
- Performance monitoring
- A/B testing (optional)

---

## API Endpoints Summary

### Required New Endpoints

The following endpoints need to be created for customer-facing functionality:

1. **Customer Authentication**
   - `POST /api/auth/customer-login` - Customer login
   - `POST /api/auth/customer-register` - Customer registration
   - `POST /api/auth/customer-logout` - Customer logout

2. **Customer Bookings**
   - `GET /api/bookings/customer/{customerId}` - Get customer bookings
   - `GET /api/bookings/customer/{customerId}/upcoming` - Upcoming bookings

3. **Customer Orders**
   - `GET /api/transactions/customer/{customerId}` - Get customer orders

4. **Public Endpoints** (No auth required)
   - `GET /api/products/public?tenantSlug={slug}` - Public product listing
   - `GET /api/bookings/time-slots/public` - Public time slots

---

## Conclusion

This specification provides a comprehensive foundation for building a client-facing mobile application using Expo that integrates seamlessly with the LocalPro POS system. The app will enable customers to book services, order products, and manage their interactions with businesses efficiently.

For implementation, follow the phases outlined and ensure proper testing at each stage. The modular architecture allows for iterative development and easy maintenance.

---

**Last Updated**: 2024
**Version**: 1.0
**Author**: LocalPro POS Development Team
