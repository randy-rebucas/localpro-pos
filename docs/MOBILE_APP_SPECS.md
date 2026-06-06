# LocalPro POS — Mobile App Specification

**App Name:** 1POS Customer App  
**Platform:** iOS + Android (React Native, Expo SDK 52)  
**Target Users:** End customers of businesses running LocalPro POS (retail, food & beverage, salons, clinics)  
**Core Purpose:** Give customers a branded self-service portal to shop, book services, track orders, and manage their loyalty account — all backed by the existing 1POS API.

---

## 1. Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Expo (React Native) | SDK 52 |
| Language | TypeScript | 5.x |
| Navigation | Expo Router (file-based) | 4.x |
| State — client | Zustand | 5.x |
| State — server | TanStack React Query | 5.x |
| HTTP | Axios | 1.x |
| Secure storage | expo-secure-store | latest |
| Styling | NativeWind (Tailwind for RN) | 4.x |
| Forms | react-hook-form + Zod | latest |
| Push notifications | expo-notifications | latest |
| Images | expo-image | latest |
| Camera (optional) | expo-camera | latest |
| Date utils | date-fns | 3.x |
| Build & OTA | EAS Build + EAS Update | latest |

**Backend:** Existing Next.js 16 API at `EXPO_PUBLIC_API_URL` (no new backend work required).

---

## 2. App Architecture

### Folder Structure

```
localpro-mobile/
├── app/                          # Expo Router routes
│   ├── _layout.tsx               # Root layout (auth guard, query client)
│   ├── index.tsx                 # Splash / redirect
│   ├── auth/
│   │   ├── phone.tsx             # Phone number entry
│   │   └── otp.tsx               # OTP verification
│   └── (tabs)/
│       ├── _layout.tsx           # Bottom tab navigator
│       ├── home.tsx
│       ├── shop/
│       │   ├── index.tsx         # Product list
│       │   ├── [id].tsx          # Product detail
│       │   └── cart.tsx          # Cart & checkout
│       ├── bookings/
│       │   ├── index.tsx         # Booking list
│       │   ├── new.tsx           # New booking wizard
│       │   └── [id].tsx          # Booking detail
│       ├── orders/
│       │   ├── index.tsx         # Order history
│       │   └── [id].tsx          # Order / receipt detail
│       └── profile/
│           ├── index.tsx         # Profile overview
│           └── addresses.tsx     # Manage addresses
├── src/
│   ├── api/                      # Axios query functions (one file per domain)
│   │   ├── auth.ts
│   │   ├── products.ts
│   │   ├── transactions.ts
│   │   ├── bookings.ts
│   │   ├── customers.ts
│   │   └── loyalty.ts
│   ├── stores/                   # Zustand stores
│   │   ├── authStore.ts          # JWT, customerId, tenantSlug
│   │   ├── cartStore.ts          # Cart items, discount, total
│   │   └── bookingStore.ts       # Draft booking state
│   ├── components/               # Reusable UI components
│   ├── hooks/                    # Custom hooks
│   ├── lib/
│   │   └── api.ts                # Axios instance + token interceptor
│   └── types/                    # Shared TypeScript interfaces
├── assets/
├── app.json
├── eas.json
└── tailwind.config.js
```

### Navigation Tree

```
Root (_layout.tsx) — auth guard
├── /index             → redirects to /auth/phone OR /(tabs)/home
├── /auth/phone
├── /auth/otp
└── /(tabs)
    ├── home
    ├── shop
    │   ├── index
    │   ├── [id]
    │   └── cart
    ├── bookings
    │   ├── index
    │   ├── new
    │   └── [id]
    ├── orders
    │   ├── index
    │   └── [id]
    └── profile
        ├── index
        └── addresses
```

### State Management

| Store | Responsibility |
|---|---|
| `authStore` | JWT token, `customerId`, `tenantSlug`, auth state |
| `cartStore` | Line items, quantities, applied discount code, running total |
| `bookingStore` | Draft booking (service, staff, date, time slot) across wizard steps |

React Query handles all server state (product lists, order history, bookings). Zustand stores are persisted to `expo-secure-store` (auth) and in-memory (cart, booking draft).

### API Client (`src/lib/api.ts`)

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('customer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

---

## 3. Screen Inventory

| Route | Screen Name | Purpose | Data Dependencies | Auth Required |
|---|---|---|---|---|
| `/` | Splash | Check token → redirect | authStore | No |
| `/auth/phone` | Phone Entry | Enter phone + tenant slug | — | No |
| `/auth/otp` | OTP Verify | 6-digit OTP input, resend | — | No |
| `/(tabs)/home` | Home Dashboard | Loyalty balance, quick actions, recent order | loyalty, last order | Yes |
| `/(tabs)/shop` | Product List | Browse + search + filter by category | products, categories | No |
| `/(tabs)/shop/[id]` | Product Detail | Images, description, variations, add to cart | product | No |
| `/(tabs)/shop/cart` | Cart & Checkout | Review items, discount, payment method, submit | cartStore, customer balance | Yes |
| `/(tabs)/bookings` | Booking List | Upcoming + past bookings | customer bookings | Yes |
| `/(tabs)/bookings/new` | New Booking | Service → staff → date → time slot → confirm | staff, time slots | Yes |
| `/(tabs)/bookings/[id]` | Booking Detail | View details, cancel | booking | Yes |
| `/(tabs)/orders` | Order History | Paginated transaction list | customer transactions | Yes |
| `/(tabs)/orders/[id]` | Order Detail | Receipt view with line items | transaction | Yes |
| `/(tabs)/profile` | Profile | Name, email, phone, loyalty summary | customer | Yes |
| `/(tabs)/profile/addresses` | Addresses | Add / edit / delete delivery addresses | customer.addresses | Yes |

---

## 4. Core Features

### Feature 1 — SMS OTP Authentication

**User story:** As a customer, I want to log in with my phone number so that I don't need to remember a password.

**Acceptance criteria:**
- Customer enters phone number in E.164 format; app sends `POST /api/auth/customer/send-otp`
- 6-digit OTP delivered via Twilio SMS within 30 seconds
- OTP input auto-advances digits; "Resend" available after 60-second cooldown
- On success, JWT stored in `expo-secure-store`; user redirected to Home
- New customers are auto-registered on first successful OTP verification
- After 5 failed attempts the account is locked for 10 minutes (backend enforced)

**Edge cases:** invalid phone format, Twilio delivery failure, expired OTP (10 min), no network.

---

### Feature 2 — Product Browse & Cart

**User story:** As a customer, I want to browse products and add them to a cart so that I can purchase items from the business.

**Acceptance criteria:**
- Product list loads paginated (20/page) with infinite scroll
- Search by name and filter by category
- Products with variations (size, color, type) show a variant picker before adding to cart
- Out-of-stock products display a badge and cannot be added
- Cart persists across navigation (Zustand in-memory)
- Cart badge shows item count on the Shop tab icon

**Edge cases:** product becomes unavailable between browse and checkout, variation-specific stock depletion, zero-stock variants.

---

### Feature 3 — Checkout

**User story:** As a customer, I want to complete a purchase so that I can receive my ordered items.

**Acceptance criteria:**
- Cart screen shows itemized list, subtotal, discount line, tax, and total
- Discount code field validates via `POST /api/discounts/validate` in real time
- Payment options: **On-Account** (deducted from account balance if ≥ total) or **Cash on Pickup**
- Loyalty points earned are shown before confirming
- On submit, `POST /api/transactions` creates the order; navigates to Order Detail on success
- Receipt shown with order number and pickup/delivery instructions

**Edge cases:** insufficient account balance, expired discount code, network failure mid-submit (idempotency key), empty cart on navigation.

---

### Feature 4 — Service Booking

**User story:** As a customer, I want to book a service appointment so that I can schedule a visit at a convenient time.

**Acceptance criteria:**
- Step 1: Select service from product list (type = `service`)
- Step 2: Select staff member (optional — shows "Any available")
- Step 3: Pick a date from a calendar (30-day forward window)
- Step 4: Pick an available time slot from `GET /api/bookings/time-slots`
- Step 5: Confirm screen showing summary; submit creates booking via `POST /api/bookings`
- Booking confirmation sent via SMS/email (backend handles)
- Customer receives push notification 24 hours before appointment

**Edge cases:** slot taken between selection and submit (409 conflict), no slots available on chosen date, staff unavailable.

---

### Feature 5 — Loyalty & Account

**User story:** As a customer, I want to see my loyalty points and account balance so that I can redeem rewards and manage my credit.

**Acceptance criteria:**
- Home dashboard displays current loyalty points balance and account balance
- Points history accessible via Profile → Loyalty History (queries loyalty transactions)
- Points earned per transaction shown on Order Detail screen
- Account balance visible on Cart screen alongside On-Account payment option
- Low balance warning shown if account balance < cart total

**Edge cases:** loyalty program disabled for tenant (hide section), zero balance state.

---

## 5. API Contract

All requests include `Authorization: Bearer <customer_jwt>`. Tenant is resolved server-side from the JWT's `tenantId` claim.

### Authentication

```
POST /api/auth/customer/send-otp
Body:  { phone: string, tenantSlug: string }
Res:   { success: true, message: "OTP sent" }

POST /api/auth/customer/verify-otp
Body:  { phone: string, otp: string, tenantSlug: string }
Res:   { success: true, token: string, customer: Customer }
Errors: 400 invalid OTP, 429 rate limited, 423 locked
```

### Products

```
GET /api/products?page=1&limit=20&search=&categoryId=
Res: { success: true, data: Product[], pagination: { total, page, pages } }

GET /api/products/:id
Res: { success: true, data: Product }
```

### Categories

```
GET /api/categories
Res: { success: true, data: Category[] }
```

### Transactions (Orders)

```
POST /api/transactions
Body: {
  items: [{ productId, name, price, quantity, variationId? }],
  paymentMethod: "on-account" | "cash",
  discountCode?: string,
  customerId: string,
  orderType: "pickup"
}
Res: { success: true, data: Transaction }

GET /api/transactions/customer/:customerId?page=1&limit=20
Res: { success: true, data: Transaction[], pagination: {...} }

GET /api/transactions/:id
Res: { success: true, data: Transaction }
```

### Bookings

```
GET /api/bookings/time-slots?date=YYYY-MM-DD&staffId=&serviceId=
Res: { success: true, data: string[] }  // ISO time strings

POST /api/bookings
Body: {
  customerId, customerName, customerPhone, customerEmail,
  serviceName, serviceDescription, staffId?, staffName?,
  startTime: ISO, endTime: ISO, duration: number, notes?
}
Res: { success: true, data: Booking }

GET /api/bookings/customer/:customerId?status=
Res: { success: true, data: Booking[] }

GET /api/bookings/:id
Res: { success: true, data: Booking }

PUT /api/bookings/:id
Body: { status: "cancelled" }
Res: { success: true, data: Booking }
```

### Customer Profile

```
GET /api/customers/:id
Res: { success: true, data: Customer }

PUT /api/customers/:id
Body: Partial<Customer>
Res: { success: true, data: Customer }
```

### Loyalty

```
GET /api/loyalty/customers/:customerId
Res: { success: true, data: { balance: number, transactions: LoyaltyTransaction[] } }
```

### Discounts

```
POST /api/discounts/validate
Body: { code: string, orderTotal: number, customerId: string }
Res: { success: true, data: { discountAmount: number, discountType: "percentage"|"fixed" } }
Errors: 400 invalid/expired, 404 not found
```

---

## 6. Data Models

```typescript
interface Customer {
  _id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  dateOfBirth?: string;
  notes?: string;
  tags: string[];
  totalSpent: number;
  lastPurchaseDate?: string;
  loyaltyPointsBalance: number;
  accountBalance: number;
  creditLimit: number;
  addresses: Address[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Address {
  _id: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}

interface Product {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  image?: string;
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations: ProductVariation[];
  serviceDuration?: number;        // minutes, for service products
  taxExempt: boolean;
  allowOutOfStockSales: boolean;
  isActive: boolean;
}

interface ProductVariation {
  _id: string;
  size?: string;
  color?: string;
  type?: string;
  sku?: string;
  price: number;
  stock: number;
}

interface CartItem {
  productId: string;
  variationId?: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface Transaction {
  _id: string;
  tenantId: string;
  receiptNumber: string;
  items: TransactionItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'on-account' | 'card' | 'digital';
  status: 'completed' | 'cancelled' | 'refunded';
  customerId?: string;
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  orderType: 'pos' | 'pickup' | 'delivery';
  salesChannel: 'pos' | 'mobile';
  createdAt: string;
}

interface TransactionItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface Booking {
  _id: string;
  tenantId: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  serviceName: string;
  serviceDescription?: string;
  startTime: string;    // ISO
  endTime: string;      // ISO
  duration: number;     // minutes
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  staffId?: string;
  staffName?: string;
  notes?: string;
  reminderSent: boolean;
  createdAt: string;
}

interface LoyaltyTransaction {
  _id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  balance: number;
  referenceId?: string;  // transactionId
  note?: string;
  createdAt: string;
}

interface Category {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  image?: string;
  isActive: boolean;
}
```

---

## 7. UI/UX Requirements

### Design System

**Library:** NativeWind 4 (Tailwind CSS for React Native)

**Color Tokens:**

| Token | Light | Dark |
|---|---|---|
| `primary` | `#4F46E5` (indigo-600) | `#818CF8` (indigo-400) |
| `primary-foreground` | `#FFFFFF` | `#1E1B4B` |
| `accent` | `#10B981` (emerald-500) | `#34D399` (emerald-400) |
| `background` | `#F9FAFB` | `#111827` |
| `surface` | `#FFFFFF` | `#1F2937` |
| `border` | `#E5E7EB` | `#374151` |
| `text` | `#111827` | `#F9FAFB` |
| `text-muted` | `#6B7280` | `#9CA3AF` |
| `danger` | `#EF4444` | `#F87171` |

**Typography Scale:**

| Style | Size | Weight |
|---|---|---|
| `heading-xl` | 28sp | 700 |
| `heading-lg` | 22sp | 700 |
| `heading-md` | 18sp | 600 |
| `body` | 15sp | 400 |
| `body-sm` | 13sp | 400 |
| `caption` | 11sp | 400 |
| `label` | 13sp | 600 |

**Spacing:** 4-point grid (`4, 8, 12, 16, 20, 24, 32, 40, 48px`)

**Border radius:** `sm=6`, `md=10`, `lg=16`, `full=9999`

### Navigation

Bottom tab bar with 4 tabs:

| Tab | Icon | Route |
|---|---|---|
| Home | `house` | `/(tabs)/home` |
| Shop | `shopping-bag` | `/(tabs)/shop` |
| Bookings | `calendar` | `/(tabs)/bookings` |
| Profile | `user` | `/(tabs)/profile` |

Cart item-count badge overlaid on Shop tab icon.

### Reusable Components

| Component | Props | Notes |
|---|---|---|
| `ProductCard` | `product, onAddToCart` | Image, name, price, add button |
| `VariantPicker` | `variations, selected, onChange` | Bottom sheet modal |
| `BookingCard` | `booking, onPress` | Status badge, date, service name |
| `OrderCard` | `transaction, onPress` | Receipt number, total, date |
| `LoyaltyBadge` | `points` | Pill showing points balance |
| `OTPInput` | `length=6, onComplete` | Auto-advancing digit boxes |
| `EmptyState` | `icon, title, message, action?` | Consistent empty screens |
| `SkeletonCard` | — | Placeholder while loading |
| `DiscountInput` | `onValidate` | Async validation with spinner |

---

## 8. Permissions & Device APIs

| Permission | Reason | When Requested |
|---|---|---|
| Push Notifications | Booking reminders, order updates, loyalty alerts | On Home screen first visit |
| Camera (optional) | Scan barcode on loyalty card / product | On demand in Profile |

No Location, Contacts, or Microphone permissions required.

---

## 9. Push Notifications

**Provider:** Expo Notifications → backend stores `expoPushToken` on Customer record.

| Trigger Event | Title | Body | Deep-link |
|---|---|---|---|
| Booking confirmed | "Booking Confirmed" | "Your [service] is booked for [date]" | `/bookings/:id` |
| Booking reminder (24h) | "Reminder" | "You have [service] tomorrow at [time]" | `/bookings/:id` |
| Order status updated | "Order Update" | "Your order #[receiptNo] is ready" | `/orders/:id` |
| Loyalty points earned | "Points Earned!" | "You earned [n] points on your last purchase" | `/(tabs)/home` |

**Notification payload structure:**

```json
{
  "to": "ExponentPushToken[...]",
  "title": "string",
  "body": "string",
  "data": {
    "screen": "bookings/:id | orders/:id | home",
    "id": "string"
  }
}
```

---

## 10. Performance Requirements

| Metric | Target |
|---|---|
| App launch (cold) | < 3 seconds |
| Screen transition | 60 fps (native driver) |
| Product list scroll | 60 fps (`FlatList` + `getItemLayout`) |
| API response time | < 500 ms (backend SLA) |
| Bundle size | < 15 MB JS bundle |

**Strategies:**
- `expo-image` for automatic format selection (WebP/AVIF) and memory cache
- React Query `staleTime: 60_000` to avoid redundant refetches on tab switch
- React Query persistence with `AsyncStorage` for offline product list cache
- `React.memo` on `ProductCard`, `BookingCard`, `OrderCard`
- `FlatList` with `windowSize=5` and `maxToRenderPerBatch=10`

---

## 11. Security Requirements

| Concern | Mitigation |
|---|---|
| Token storage | `expo-secure-store` only — never `AsyncStorage` for JWTs |
| Phone number display | Mask all but last 4 digits on OTP screen: `+63 *** *** 1234` |
| API keys | None in app bundle; all keys live server-side |
| Network | HTTPS only; reject self-signed certs in production |
| OTP brute force | Backend: 5 attempts max, 10-min lock (rate limiter) |
| Token expiry | 30-day JWT; prompt re-auth on 401 |
| Logout | Delete token from `expo-secure-store` + clear Zustand stores |

---

## 12. Testing Plan

### Unit Tests (Vitest / Jest)

| Target | What to test |
|---|---|
| `authStore` | login, logout, token persistence |
| `cartStore` | addItem, removeItem, applyDiscount, totalCalc |
| `bookingStore` | step navigation, draft persistence |
| Zod schemas | phone validation, OTP format, booking date rules |
| `formatCurrency`, `formatDate` utils | edge cases |

### Integration Tests

| Flow | Scope |
|---|---|
| OTP Auth | send-otp → enter otp → verify → token stored → redirect |
| Product Browse | list loads, search filters, variant picker, add to cart |
| Checkout | cart → discount → payment selection → submit → order detail |
| Booking | service select → staff → date → slot → confirm → booking detail |

### E2E Tests (Maestro)

| Test | Device Matrix |
|---|---|
| Full OTP → checkout flow | iOS 16+ (iPhone 14 sim), Android 12+ (Pixel 6 em) |
| Full booking flow | same |
| Push notification tap → deep link | same |

---

## 13. Deployment & OTA

### EAS Build Profiles (`eas.json`)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "http://localhost:3000" }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "env": { "EXPO_PUBLIC_API_URL": "https://staging.1pos.app" }
    },
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://api.1pos.app" }
    }
  }
}
```

### EAS Update (OTA)

- JS-only fixes and content updates ship via `eas update --branch production` without App Store review
- Native changes (new permissions, SDK upgrades) require a full `eas build`
- Update channel per branch: `development` → `preview` → `production`

### App Store Metadata

| Field | Value |
|---|---|
| App name | 1POS Customer |
| Category | Shopping / Business |
| iOS minimum | 16.0 |
| Android minimum | API 31 (Android 12) |
| Privacy policy | Required (phone number collection) |
| Age rating | 4+ / Everyone |

---

## Appendix — Environment Variables

```bash
# .env.local (development)
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_TENANT_SLUG=default

# EAS secrets (production)
EXPO_PUBLIC_API_URL=https://api.1pos.app
```

---

*Last updated: 2026-04-26 | Version: 1.0*
