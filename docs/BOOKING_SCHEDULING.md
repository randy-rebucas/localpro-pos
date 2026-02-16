# Booking & Scheduling System

A comprehensive booking and scheduling system for service-based businesses like salons, cleaners, repair/technician services, and contractors.

## Features

### ✅ Core Features

1. **Calendar View**
   - Month, week, and day views
   - Visual representation of bookings
   - Color-coded status indicators
   - Click to view/edit bookings

2. **Time Slot Management**
   - Automatic conflict detection
   - Configurable slot intervals
   - Duration-based booking slots
   - Available time slot API endpoint

3. **Reminders**
   - Automated reminder system
   - Manual reminder sending
   - Configurable reminder timing (default: 24 hours before)
   - Email and SMS support

4. **Staff Assignment**
   - Assign bookings to staff members
   - Staff-specific conflict checking
   - Filter bookings by staff member
   - Unassigned booking support

5. **Booking Confirmation**
   - Automatic confirmation emails/SMS
   - Manual confirmation sending
   - Cancellation notifications
   - Status-based notifications

## Data Model

### Booking Schema

```typescript
{
  tenantId: ObjectId,
  customerName: string (required),
  customerEmail?: string,
  customerPhone?: string,
  serviceName: string (required),
  serviceDescription?: string,
  startTime: Date (required),
  endTime: Date (required),
  duration: number (minutes, required),
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show',
  staffId?: ObjectId (ref: User),
  staffName?: string,
  notes?: string,
  reminderSent: boolean,
  confirmationSent: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### Bookings

- `GET /api/bookings` - Get all bookings (with filters)
  - Query params: `startDate`, `endDate`, `status`, `staffId`
  
- `POST /api/bookings` - Create a new booking
  - Body: Booking data (customerName, serviceName, startTime, duration, etc.)
  - Automatically checks for conflicts
  - Sends confirmation if status is 'confirmed'

- `GET /api/bookings/[id]` - Get a single booking

- `PUT /api/bookings/[id]` - Update a booking
  - Body: Partial booking data
  - Checks for conflicts on time changes
  - Sends notifications on status changes

- `DELETE /api/bookings/[id]` - Delete/cancel a booking
  - Sends cancellation notification

### Time Slots

- `GET /api/bookings/time-slots` - Get available time slots
  - Query params:
    - `date` (required): ISO date string
    - `staffId` (optional): Filter by staff member
    - `duration` (optional, default: 60): Duration in minutes
    - `slotInterval` (optional, default: 30): Interval between slots
    - `startHour` (optional, default: 9): Start hour
    - `endHour` (optional, default: 17): End hour

### Reminders

- `POST /api/bookings/[id]/reminder` - Send reminder for a specific booking

- `POST /api/bookings/reminders/send` - Send reminders for upcoming bookings
  - Query params:
    - `hoursBefore` (optional, default: 24): Hours before booking to send reminder
  - Finds all bookings in the reminder window and sends notifications

## UI Components

### BookingCalendar Component

A reusable calendar component that displays bookings in a monthly view.

**Props:**
- `bookings`: Array of booking objects
- `onDateSelect`: Callback when a date is clicked
- `onBookingSelect`: Callback when a booking is clicked
- `selectedDate`: Currently selected date

**Features:**
- Month navigation
- View switching (month/week/day)
- Color-coded booking status
- Click to view details

### Bookings Page

Full-featured booking management page at `/admin/bookings`.

**Features:**
- Calendar view integration
- Booking list with filters
- Create/Edit/Delete bookings
- Staff assignment
- Status management
- Reminder sending
- Customer contact information

## Notification System

The notification system supports both email and SMS notifications. Currently implemented as placeholder functions that log to console. To enable actual notifications:

### Email Integration

Update `lib/notifications.ts` to integrate with your email provider:

```typescript
// Example with SendGrid
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendEmail(options: NotificationOptions): Promise<boolean> {
  await sgMail.send({
    to: options.to,
    from: process.env.FROM_EMAIL,
    subject: options.subject,
    text: options.message,
  });
  return true;
}
```

### SMS Integration

Update `lib/notifications.ts` to integrate with your SMS provider:

```typescript
// Example with Twilio
import twilio from 'twilio';
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

export async function sendSMS(options: NotificationOptions): Promise<boolean> {
  await client.messages.create({
    body: options.message,
    to: options.to,
    from: process.env.TWILIO_PHONE,
  });
  return true;
}
```

## Tenant Settings

Add the `enableBookingScheduling` feature flag to tenant settings:

```json
{
  "settings": {
    "enableBookingScheduling": true
  }
}
```

## Usage Examples

### Create a Booking

```javascript
const response = await fetch('/api/bookings?tenant=default', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <token>',
  },
  body: JSON.stringify({
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerPhone: '+1234567890',
    serviceName: 'Haircut',
    startTime: '2024-01-15T10:00:00Z',
    duration: 60,
    staffId: 'staff-member-id',
    status: 'confirmed',
  }),
});
```

### Get Available Time Slots

```javascript
const response = await fetch(
  '/api/bookings/time-slots?tenant=default&date=2024-01-15&duration=60&slotInterval=30'
);
const { data } = await response.json();
// data.slots contains available time slots
```

### Send Reminders for Upcoming Bookings

```javascript
const response = await fetch(
  '/api/bookings/reminders/send?tenant=default&hoursBefore=24',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <token>',
    },
  }
);
```

## Automated Reminders

To set up automated reminders, create a cron job or scheduled task that calls:

```
POST /api/bookings/reminders/send?tenant=<tenant-slug>&hoursBefore=24
```

This should run periodically (e.g., every hour) to check for bookings that need reminders.

## Conflict Detection

The system automatically detects conflicts when:
- Creating a new booking
- Updating a booking's time
- Assigning staff to a booking

Conflicts are checked based on:
- Time overlap (startTime < existing.endTime && endTime > existing.startTime)
- Staff assignment (if staff is assigned, checks only that staff's bookings)
- Status (only 'pending' and 'confirmed' bookings are considered)

## Status Flow

1. **Pending** - Initial status, awaiting confirmation
2. **Confirmed** - Booking confirmed, confirmation sent
3. **Completed** - Service completed
4. **Cancelled** - Booking cancelled, cancellation notification sent
5. **No Show** - Customer didn't show up

## Future Enhancements

Potential improvements:
- Recurring bookings
- Service duration templates
- Customer history
- Booking waitlist
- Online booking portal
- Integration with payment systems
- Multi-service bookings
- Resource booking (rooms, equipment)
- Time zone support
- Business hours configuration
- Holiday calendars

## Security

- All endpoints require authentication
- Tenant isolation enforced
- Role-based access control
- Input validation
- Conflict prevention

## Testing

Test the booking system:

1. Enable the feature flag in tenant settings
2. Navigate to `/admin/bookings`
3. Create a test booking
4. Verify conflict detection
5. Test reminder sending
6. Test status changes and notifications

