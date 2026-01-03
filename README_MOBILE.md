# 1POS - Mobile App Integration

This document provides an overview of the mobile app integration for 1POS, including customer authentication via Twilio OTP and all customer-facing API endpoints.

---

## 📱 Overview

The mobile app enables customers to:
- **Authenticate** using SMS OTP (Twilio)
- **Book services** with calendar and time slot selection
- **Shop products** with cart and checkout
- **View bookings** and manage appointments
- **Track orders** and view order history
- **Manage profile** and addresses

---

## 🚀 Quick Start

### Backend Setup (5 minutes)

1. **Configure Twilio:**
   ```bash
   # Add to .env
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE=+1234567890
   SMS_PROVIDER=twilio
   ```

2. **Test Authentication:**
   ```bash
   npm run test:customer-auth
   ```

### Mobile App Setup (10 minutes)

1. **Create Expo Project:**
   ```bash
   npx create-expo-app@latest localpro-mobile --template blank-typescript
   ```

2. **Follow Setup Guide:**
   See [MOBILE_SETUP_GUIDE.md](./docs/MOBILE_SETUP_GUIDE.md)

---

## 📚 Documentation

### Core Documentation

1. **[MOBILE_APP_SPECS.md](./docs/MOBILE_APP_SPECS.md)**
   - Complete technical specifications
   - Feature list
   - Architecture
   - Implementation phases

2. **[MOBILE_AUTH_TWILIO.md](./docs/MOBILE_AUTH_TWILIO.md)**
   - Twilio OTP authentication guide
   - Implementation examples
   - Security features

3. **[MOBILE_SETUP_GUIDE.md](./docs/MOBILE_SETUP_GUIDE.md)**
   - Step-by-step setup instructions
   - Code examples
   - Testing procedures

4. **[MOBILE_APP_LAYOUTS.md](./docs/MOBILE_APP_LAYOUTS.md)**
   - Visual layouts and wireframes
   - UI/UX guidelines
   - Component specifications

5. **[MOBILE_API_CUSTOMER_ENDPOINTS.md](./docs/MOBILE_API_CUSTOMER_ENDPOINTS.md)**
   - Complete API reference
   - Request/response examples
   - Error handling

6. **[MOBILE_APP_QUICK_REFERENCE.md](./docs/MOBILE_APP_QUICK_REFERENCE.md)**
   - Quick reference guide
   - Code snippets
   - Common patterns

### Additional Resources

- **[MOBILE_QUICK_START_CHECKLIST.md](./docs/MOBILE_QUICK_START_CHECKLIST.md)** - Setup checklist
- **[MOBILE_API_REFERENCE.md](./docs/MOBILE_API_REFERENCE.md)** - Full API reference
- **[MOBILE_API_QUICK_START.md](./docs/MOBILE_API_QUICK_START.md)** - API quick start

---

## 🔐 Authentication Flow

### SMS OTP Authentication

1. Customer enters phone number
2. System sends 6-digit OTP via Twilio SMS
3. Customer enters OTP
4. System verifies OTP and returns JWT token (30-day expiry)
5. New customers auto-register on first login

### API Endpoints

- `POST /api/auth/customer/send-otp` - Send OTP
- `POST /api/auth/customer/verify-otp` - Verify OTP and login

---

## 📡 API Endpoints

### Authentication
- `POST /api/auth/customer/send-otp` - Send OTP
- `POST /api/auth/customer/verify-otp` - Verify OTP

### Bookings
- `GET /api/bookings/customer/{customerId}` - Get customer bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings/time-slots` - Get available time slots

### Orders
- `GET /api/transactions/customer/{customerId}` - Get customer orders
- `POST /api/transactions` - Create order

### Products
- `GET /api/products` - Get products (public)

### Profile
- `GET /api/customers/{customerId}` - Get profile
- `PUT /api/customers/{customerId}` - Update profile

---

## 🛠️ Technology Stack

### Backend
- Next.js API Routes
- MongoDB (Mongoose)
- Twilio (SMS)
- JWT (Authentication)

### Mobile App
- Expo (React Native)
- TypeScript
- Expo Router (Navigation)
- Zustand (State Management)
- Axios (HTTP Client)
- Expo SecureStore (Token Storage)

---

## 🔒 Security Features

- **OTP Expiry**: 10 minutes
- **Rate Limiting**: 1 OTP per minute
- **Attempt Limiting**: Max 5 verification attempts
- **Token Expiry**: 30 days
- **Customer Isolation**: Customers can only access their own data
- **Auto-cleanup**: Expired OTPs automatically deleted

---

## 📦 Installation

### Backend

```bash
# Install Twilio (if not already installed)
npm install twilio

# Configure environment variables
# See MOBILE_SETUP_GUIDE.md

# Test authentication
npm run test:customer-auth
```

### Mobile App

```bash
# Create Expo project
npx create-expo-app@latest localpro-mobile --template blank-typescript

# Install dependencies
npx expo install expo-router expo-secure-store expo-notifications
npm install axios zustand react-hook-form zod date-fns

# Follow setup guide
# See MOBILE_SETUP_GUIDE.md
```

---

## 🧪 Testing

### Backend Testing

```bash
# Test OTP flow
npm run test:customer-auth

# Or use curl
curl -X POST http://localhost:3000/api/auth/customer/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "tenantSlug": "default"}'
```

### Mobile App Testing

```bash
# Start Expo
cd localpro-mobile
npx expo start

# Test on device/emulator
# Scan QR code or press 'i' for iOS, 'a' for Android
```

---

## 🚢 Deployment

### Backend

1. Set production environment variables
2. Deploy to your hosting platform
3. Update CORS settings for production

### Mobile App

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build
eas build --platform ios
eas build --platform android

# Submit
eas submit --platform ios
eas submit --platform android
```

---

## 📞 Support

For issues or questions:
1. Check the documentation in `docs/` folder
2. Review troubleshooting sections
3. Check API logs for errors
4. Verify environment variables

---

## 📝 Environment Variables

### Required

```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1234567890
SMS_PROVIDER=twilio
JWT_SECRET=your-secret-key
CUSTOMER_JWT_EXPIRES_IN=30d
```

### Optional

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api
ALLOWED_ORIGINS=https://your-domain.com
```

---

## 🎯 Next Steps

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
