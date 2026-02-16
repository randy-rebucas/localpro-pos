# Client Mobile Booking App Documentation

## Overview
This mobile app enables clients to book services (e.g., regular or express), select schedule (pickup/delivery), choose location, pick payment method, and confirm bookings. Designed for multi-tenant POS systems.

---

## Authentication

Authentication is required for all booking operations. Clients must log in or register before accessing booking features.

   - Endpoint: `POST /api/auth/register`
   - Request body: `{ "name": "...", "email": "...", "password": "...", "tenantId": "..." }`
   - Response: User profile and authentication token

   - Endpoint: `POST /api/auth/login`
   - Request body: `{ "email": "...", "password": "...", "tenantId": "..." }`
   - Response: Authentication token (JWT or similar)

   - All subsequent API requests must include the token in the `Authorization` header: `Bearer <token>`

   - Endpoint: `POST /api/auth/logout`

   - Endpoint: `POST /api/auth/reset-password`

## Error Responses

All API endpoints return structured error responses for invalid input, authentication failures, or booking conflicts.

- **Example Authentication Error:**
   ```json
   {
      "error": "Invalid credentials",
      "code": 401
   }
   ```
- **Example Booking Error:**
   ```json
   {
      "error": "Time slot unavailable",
      "code": 409
   }
   ```

---
---

---

## Booking Workflow

1. **Service Selection**
   - User chooses service type: Regular or Express.

2. **Schedule Selection**
   - User selects date and time for pickup and delivery.

3. **Location Selection**
   - User chooses: Current location (via GPS) or Client address (saved/address input).

4. **Payment Selection**
   - User picks payment method: Cash or Online.

5. **Booking Confirmation**
   - User reviews booking details and confirms.


## Suggested Mobile Screens

1. **Welcome / Home**
   - Service options (Regular, Express)
   - Quick access to booking

2. **Service Selection**
   - List of available services with descriptions

3. **Schedule Picker**
   - Calendar and time slot selection for pickup/delivery

4. **Location Selection**
   - Map view (current location)
   - Address input or selection
   - Address management (add/edit/delete client addresses)

5. **Payment Method**
   - Cash or Online (integrate with payment gateway if online)

6. **Booking Review & Confirmation**
   - Summary of booking details
   - Confirm button

7. **Booking Success / Receipt**
   - Confirmation message
   - Booking reference

---

## API Endpoints

### 1. List Services
- `GET /api/services?tenantId=...`
- Returns available services (regular, express, etc.)

### 2. Get Available Schedule
- `GET /api/booking/availability?tenantId=...&serviceId=...&date=...`
- Returns available time slots

### 3. Create Booking
- `POST /api/booking`
- Request body:
  ```json
  {
    "tenantId": "tenant123",
    "userId": "user456",
    "serviceId": "service789",
    "pickup": {
      "date": "2026-02-15",
      "time": "10:00"
    },
    "delivery": {
      "date": "2026-02-16",
      "time": "14:00"
    },
    "location": {
      "type": "current|address",
      "address": "123 Main St",
      "lat": 40.7128,
      "lng": -74.0060
    },
    "paymentMethod": "cash|online"
  }
  ```

### 4. Confirm Booking
- Confirmation handled in response to booking creation

### 5. List User Bookings
- `GET /api/booking?userId=...&tenantId=...`
- Returns booking history

---

## Implementation Advice


---

## Push Notification Setup

Integrate push notification service (e.g., Firebase Cloud Messaging) to notify clients of booking confirmations, reminders, and status updates.

- **Booking Confirmation:** Sent immediately after booking is confirmed.
- **Reminders:** Sent before scheduled pickup/delivery.
- **Status Updates:** Sent for changes or cancellations.

---
---

## Best Practices


---

## Client Profile Management

Clients can view and edit their profile information, manage saved addresses, and change their password.

- **View/Edit Profile:**
   - Endpoint: `GET /api/client/profile?userId=...&tenantId=...`
   - Endpoint: `PUT /api/client/profile?userId=...&tenantId=...`
- **Address Management:**
   - Add: `POST /api/client/address`
   - Edit: `PUT /api/client/address/{addressId}`
   - Delete: `DELETE /api/client/address/{addressId}`
- **Change Password:**
   - Endpoint: `POST /api/auth/change-password`

---
---

## References

- [docs/MOBILE_API_REFERENCE.md](docs/MOBILE_API_REFERENCE.md)
- [docs/MOBILE_API_EXAMPLES.md](docs/MOBILE_API_EXAMPLES.md)
- [docs/mobile/](docs/mobile/)
