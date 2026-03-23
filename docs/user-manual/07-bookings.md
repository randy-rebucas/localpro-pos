# 7. Bookings & Scheduling

**Available to:** Manager, Admin, Owner

## Overview

The booking module manages appointments and service scheduling. It includes a calendar view, staff assignment, and automated reminders.

## Viewing Bookings

1. Navigate to **Admin > Bookings**
2. Toggle between:
   - **Calendar View** — Visual week/day calendar
   - **List View** — Tabular list of all bookings

### Calendar Navigation

- Use **arrows** to move between weeks/days
- Click a **date** to jump to that day
- Color-coded by status:
  - **Blue** — Confirmed
  - **Yellow** — Pending
  - **Green** — Completed
  - **Red** — Cancelled / No-Show

## Creating a Booking

1. Click **New Booking** or click an empty time slot
2. Fill in the details:

| Field | Required | Description |
|-------|----------|-------------|
| **Customer** | Yes | Select or create a customer |
| **Service** | Yes | The service/product being booked |
| **Date** | Yes | Appointment date |
| **Time** | Yes | Start time |
| **Duration** | Yes | Length of appointment |
| **Staff** | No | Assign to a specific team member |
| **Notes** | No | Special instructions or requests |

3. Click **Create Booking**
4. A confirmation notification is sent to the customer (if email/SMS configured)

## Booking Statuses

| Status | Description |
|--------|-------------|
| **Pending** | Awaiting confirmation |
| **Confirmed** | Booking confirmed |
| **In Progress** | Currently being serviced |
| **Completed** | Service finished |
| **Cancelled** | Booking was cancelled |
| **No-Show** | Customer did not arrive |

## Managing Bookings

### Editing a Booking

1. Click the booking in the calendar or list
2. Modify details (date, time, staff, etc.)
3. Click **Update**
4. Customer is notified of changes (if configured)

### Cancelling a Booking

1. Open the booking
2. Click **Cancel**
3. Enter a cancellation reason
4. Confirm

### Marking as No-Show

1. After the appointment time passes with no customer arrival
2. Open the booking
3. Click **No-Show**
4. The system records the no-show for customer tracking

## Conflict Detection

The system prevents double-booking:
- When creating or editing a booking, if the selected time slot overlaps with an existing booking for the same staff member, a warning appears
- You can override conflicts if needed (e.g., group sessions)

## Automated Notifications

When configured in **Settings > Notifications**:

| Trigger | Timing | Channel |
|---------|--------|---------|
| **Booking Confirmation** | Immediately after creation | Email / SMS |
| **Booking Reminder** | 24 hours before appointment | Email / SMS |
| **Booking Update** | When details change | Email / SMS |
| **No-Show Follow-up** | After marking no-show | Email |

## Business Hours

Bookings respect your configured business hours:
- Time slots outside business hours are greyed out
- Holiday dates show as unavailable
- Configure hours in **Settings > Business Hours**
- Configure holidays in **Settings > Holidays**
