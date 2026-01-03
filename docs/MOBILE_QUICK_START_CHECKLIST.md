# Mobile App Quick Start Checklist

Use this checklist to quickly set up and test the mobile app with Twilio OTP authentication.

---

## ✅ Backend Setup

### Environment Configuration
- [ ] Add Twilio credentials to `.env`:
  ```bash
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=your_auth_token
  TWILIO_PHONE=+1234567890
  SMS_PROVIDER=twilio
  JWT_SECRET=your-secret-key
  CUSTOMER_JWT_EXPIRES_IN=30d
  ```

### Verify Installation
- [ ] Twilio package installed (`npm install twilio`)
- [ ] Backend server starts without errors (`npm run dev`)
- [ ] Database connection working
- [ ] CORS configured in `next.config.ts` (already done)

### Test Backend Endpoints
- [ ] Test OTP send endpoint:
  ```bash
  curl -X POST http://localhost:3000/api/auth/customer/send-otp \
    -H "Content-Type: application/json" \
    -d '{"phone": "+1234567890", "tenantSlug": "default"}'
  ```
- [ ] Check console for OTP code (development mode)
- [ ] Test OTP verify endpoint:
  ```bash
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
- [ ] Run automated test script:
  ```bash
  npm run test:customer-auth
  ```

---

## ✅ Mobile App Setup

### Project Initialization
- [ ] Create Expo project: `npx create-expo-app@latest localpro-mobile --template blank-typescript`
- [ ] Install dependencies:
  ```bash
  npx expo install expo-router expo-secure-store expo-notifications
  npm install axios zustand react-hook-form zod date-fns
  ```

### Project Structure
- [ ] Create folder structure:
  ```
  app/
  lib/api/
  stores/
  components/
  constants/
  ```

### Configuration
- [ ] Create `constants/config.ts` with API URL
- [ ] Create `lib/api/client.ts` with axios setup
- [ ] Create `lib/api/auth.ts` with auth functions
- [ ] Create `stores/authStore.ts` with Zustand store

### Login Screen
- [ ] Create `app/(auth)/login.tsx`
- [ ] Implement phone input
- [ ] Implement OTP input
- [ ] Implement registration form (for new customers)
- [ ] Add loading states
- [ ] Add error handling

### Navigation
- [ ] Set up Expo Router
- [ ] Create auth stack `app/(auth)/_layout.tsx`
- [ ] Create tabs stack `app/(tabs)/_layout.tsx`
- [ ] Implement protected routes

---

## ✅ Testing

### Development Testing
- [ ] Start backend: `npm run dev`
- [ ] Start mobile app: `npx expo start`
- [ ] Test on device/emulator
- [ ] Test phone number input
- [ ] Test OTP sending (check console/SMS)
- [ ] Test OTP verification
- [ ] Test new customer registration
- [ ] Test existing customer login
- [ ] Test token persistence
- [ ] Test authenticated API calls

### Integration Testing
- [ ] Test booking creation
- [ ] Test order creation
- [ ] Test fetching customer bookings
- [ ] Test fetching customer orders
- [ ] Test profile update

---

## ✅ Production Preparation

### Environment Variables
- [ ] Update production `.env` with production Twilio credentials
- [ ] Set strong `JWT_SECRET`
- [ ] Update `NEXT_PUBLIC_API_URL` to production URL
- [ ] Configure `ALLOWED_ORIGINS` in `next.config.ts`

### Mobile App Configuration
- [ ] Update `constants/config.ts` with production API URL
- [ ] Configure app.json for production
- [ ] Set up app icons and splash screens
- [ ] Configure app permissions

### Build & Deploy
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Configure EAS: `eas build:configure`
- [ ] Build iOS app: `eas build --platform ios`
- [ ] Build Android app: `eas build --platform android`
- [ ] Test production builds
- [ ] Submit to App Store
- [ ] Submit to Google Play

---

## ✅ Documentation

- [ ] Review [MOBILE_APP_SPECS.md](./MOBILE_APP_SPECS.md)
- [ ] Review [MOBILE_AUTH_TWILIO.md](./MOBILE_AUTH_TWILIO.md)
- [ ] Review [MOBILE_SETUP_GUIDE.md](./MOBILE_SETUP_GUIDE.md)
- [ ] Review [MOBILE_API_CUSTOMER_ENDPOINTS.md](./MOBILE_API_CUSTOMER_ENDPOINTS.md)

---

## 🐛 Troubleshooting

### Common Issues

**OTP Not Received:**
- [ ] Check Twilio credentials
- [ ] Verify phone number format (E.164)
- Check Twilio account balance
- [ ] Verify phone number in Twilio (trial accounts)
- [ ] Check backend console for errors

**Authentication Fails:**
- [ ] Verify JWT_SECRET is set
- [ ] Check token expiry
- [ ] Verify customer exists in database
- [ ] Check API logs

**Mobile App Can't Connect:**
- [ ] Verify API_BASE_URL
- [ ] Check CORS settings
- [ ] Ensure backend is running
- [ ] For local testing, use computer IP instead of localhost

---

## 📝 Notes

- In development, OTPs are logged to console (check backend logs)
- In production, OTPs are sent via SMS
- Phone numbers are normalized (non-digits removed)
- OTPs expire after 10 minutes
- Rate limit: 1 OTP per minute per phone
- Max 5 verification attempts per OTP

---

**Last Updated**: 2024
**Version**: 1.0
