/**
 * Day-to-day operations: bookings, recurring booking templates, staff
 * attendance, cash drawer sessions and BIR Z-Readings.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { id, money, objectId, tenantId, timestamps, timestamptz } from './_columns';
import { users } from './core';
import { branches } from './org';

export const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'] as const;

// models/Booking.ts — pre-save logic moving to the repository: end_time = start_time + duration,
// staff_name looked up from users when staff_id changes; isPast/isToday virtuals.
// EXCLUDE constraint bookings_staff_no_overlap added in db/migrations/custom SQL
// (replaces the pre-save overlap query; repository maps its violation to the old error message).
export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    tenantId: tenantId(),
    customerName: text('customer_name').notNull(),
    // Lowercased + trimmed by the repository layer
    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    serviceName: text('service_name').notNull(),
    serviceDescription: text('service_description'),
    startTime: timestamptz('start_time').notNull(),
    endTime: timestamptz('end_time').notNull(),
    // Minutes
    duration: integer('duration').notNull(),
    status: text('status', { enum: BOOKING_STATUSES }).notNull().default('pending'),
    staffId: objectId('staff_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    // Denormalized copy of users.name
    staffName: text('staff_name'),
    notes: text('notes'),
    reminderSent: boolean('reminder_sent').notNull().default(false),
    confirmationSent: boolean('confirmation_sent').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('bookings_tenant_start_time_idx').on(t.tenantId, t.startTime),
    index('bookings_tenant_staff_start_time_idx').on(t.tenantId, t.staffId, t.startTime),
    index('bookings_tenant_status_start_time_idx').on(t.tenantId, t.status, t.startTime),
    index('bookings_tenant_customer_email_start_time_idx').on(t.tenantId, t.customerEmail, t.startTime.desc()),
    index('bookings_tenant_customer_phone_idx').on(t.tenantId, t.customerPhone),
    check('bookings_status_check', sql`${t.status} IN ('pending', 'confirmed', 'completed', 'cancelled', 'no-show')`),
    check('bookings_time_range_check', sql`${t.endTime} > ${t.startTime}`),
    check('bookings_duration_check', sql`${t.duration} >= 1`),
    check('bookings_customer_email_format', sql`${t.customerEmail} IS NULL OR ${t.customerEmail} ~ '^\\S+@\\S+\\.\\S+$'`),
  ]
);

export const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'] as const;

// models/RecurringBookingTemplate.ts
export const recurringBookingTemplates = pgTable(
  'recurring_booking_templates',
  {
    id: id(),
    tenantId: tenantId(),
    customerName: text('customer_name').notNull(),
    // Lowercased + trimmed by the repository layer
    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    serviceName: text('service_name').notNull(),
    serviceDescription: text('service_description'),
    staffId: objectId('staff_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    // Denormalized copy of users.name
    staffName: text('staff_name'),
    // Minutes
    duration: integer('duration').notNull(),
    startTimeHour: integer('start_time_hour').notNull(),
    startTimeMinute: integer('start_time_minute').notNull(),
    recurrenceType: text('recurrence_type', { enum: RECURRENCE_TYPES }).notNull(),
    // 0=Sun…6=Sat, used when recurrence_type = 'weekly'
    daysOfWeek: integer('days_of_week').array().notNull().default(sql`'{}'::integer[]`),
    // 1-31, used when recurrence_type = 'monthly'
    dayOfMonth: integer('day_of_month'),
    effectiveFrom: timestamptz('effective_from').notNull(),
    // NULL = no end date
    effectiveTo: timestamptz('effective_to'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    // { tenantId, isActive } is covered by neither compound below (staff/recurrence sit in between), so kept
    index('recurring_booking_templates_tenant_active_idx').on(t.tenantId, t.isActive),
    index('recurring_booking_templates_tenant_staff_active_idx').on(t.tenantId, t.staffId, t.isActive),
    index('recurring_booking_templates_tenant_recurrence_active_idx').on(t.tenantId, t.recurrenceType, t.isActive),
    check('recurring_booking_templates_recurrence_type_check', sql`${t.recurrenceType} IN ('daily', 'weekly', 'monthly')`),
    check('recurring_booking_templates_days_of_week_check', sql`${t.daysOfWeek} <@ ARRAY[0,1,2,3,4,5,6]`),
    check(
      'recurring_booking_templates_time_check',
      sql`${t.duration} >= 1 AND ${t.startTimeHour} BETWEEN 0 AND 23 AND ${t.startTimeMinute} BETWEEN 0 AND 59`
    ),
    check(
      'recurring_booking_templates_day_of_month_check',
      sql`${t.dayOfMonth} IS NULL OR ${t.dayOfMonth} BETWEEN 1 AND 31`
    ),
  ]
);

// models/Attendance.ts — pre-save total_hours = (clock_out - clock_in - break) in hours,
// rounded to 2 decimals, moves to the repository.
export const attendance = pgTable(
  'attendance',
  {
    id: id(),
    tenantId: tenantId(),
    userId: objectId('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    clockIn: timestamptz('clock_in').notNull(),
    clockOut: timestamptz('clock_out'),
    breakStart: timestamptz('break_start'),
    breakEnd: timestamptz('break_end'),
    totalHours: numeric('total_hours', { precision: 7, scale: 2, mode: 'number' }),
    notes: text('notes'),
    locationLatitude: doublePrecision('location_latitude'),
    locationLongitude: doublePrecision('location_longitude'),
    locationAddress: text('location_address'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('attendance_tenant_user_clock_in_idx').on(t.tenantId, t.userId, t.clockIn.desc()),
    index('attendance_tenant_clock_in_idx').on(t.tenantId, t.clockIn.desc()),
    // One open shift per user (guards concurrent clock-ins)
    uniqueIndex('attendance_open_shift_key').on(t.tenantId, t.userId).where(sql`${t.clockOut} IS NULL`),
    // Tenant-wide open-shift scan (auto clock-out, break detection, cash-count reminders)
    index('attendance_tenant_open_idx').on(t.tenantId).where(sql`${t.clockOut} IS NULL`),
    check('attendance_total_hours_non_negative', sql`${t.totalHours} IS NULL OR ${t.totalHours} >= 0`),
    check('attendance_notes_length', sql`${t.notes} IS NULL OR char_length(${t.notes}) <= 500`),
    check(
      'attendance_location_range',
      sql`(${t.locationLatitude} IS NULL OR ${t.locationLatitude} BETWEEN -90 AND 90) AND (${t.locationLongitude} IS NULL OR ${t.locationLongitude} BETWEEN -180 AND 180)`
    ),
  ]
);

export const CASH_DRAWER_STATUSES = ['open', 'closed'] as const;

// models/CashDrawerSession.ts
export const cashDrawerSessions = pgTable(
  'cash_drawer_sessions',
  {
    id: id(),
    tenantId: tenantId(),
    userId: objectId('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    openingAmount: money('opening_amount').notNull(),
    closingAmount: money('closing_amount'),
    expectedAmount: money('expected_amount'),
    shortage: money('shortage'),
    overage: money('overage'),
    openingTime: timestamptz('opening_time').notNull().defaultNow(),
    closingTime: timestamptz('closing_time'),
    status: text('status', { enum: CASH_DRAWER_STATUSES }).notNull().default('open'),
    notes: text('notes'),
    totalVat: money('total_vat').notNull().default(0),
    totalDiscounts: money('total_discounts').notNull().default(0),
    ...timestamps(),
  },
  t => [
    index('cash_drawer_sessions_tenant_opening_time_idx').on(t.tenantId, t.openingTime.desc()),
    index('cash_drawer_sessions_tenant_user_status_idx').on(t.tenantId, t.userId, t.status),
    // One open drawer per tenant
    uniqueIndex('cash_drawer_sessions_open_key').on(t.tenantId).where(sql`${t.status} = 'open'`),
    check('cash_drawer_sessions_status_check', sql`${t.status} IN ('open', 'closed')`),
    check(
      'cash_drawer_sessions_amounts_non_negative',
      sql`${t.openingAmount} >= 0 AND (${t.closingAmount} IS NULL OR ${t.closingAmount} >= 0) AND (${t.expectedAmount} IS NULL OR ${t.expectedAmount} >= 0) AND (${t.shortage} IS NULL OR ${t.shortage} >= 0) AND (${t.overage} IS NULL OR ${t.overage} >= 0) AND ${t.totalVat} >= 0 AND ${t.totalDiscounts} >= 0`
    ),
  ]
);

// models/ZReading.ts — BIR end-of-day report; immutable once written (repository exposes insert only).
export const zReadings = pgTable(
  'z_readings',
  {
    id: id(),
    tenantId: tenantId(),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    // Normalized to local midnight of the reporting day (kept as timestamptz, not date,
    // to preserve the exact instant the app computes)
    businessDate: timestamptz('business_date').notNull(),
    beginningGt: money('beginning_gt').notNull(),
    endingGt: money('ending_gt').notNull(),
    grossSales: money('gross_sales').notNull(),
    vatableSales: money('vatable_sales').notNull().default(0),
    vatAmount: money('vat_amount').notNull().default(0),
    vatExemptSales: money('vat_exempt_sales').notNull().default(0),
    zeroRatedSales: money('zero_rated_sales').notNull().default(0),
    discountTotal: money('discount_total').notNull().default(0),
    transactionCount: integer('transaction_count').notNull().default(0),
    voidCount: integer('void_count').notNull().default(0),
    generatedBy: objectId('generated_by')
      .notNull()
      .references((): AnyPgColumn => users.id),
    generatedAt: timestamptz('generated_at').notNull().defaultNow(),
    ...timestamps(),
  },
  t => [
    // Mongo treats a missing branchId as a value in unique indexes → NULLS NOT DISTINCT
    unique('z_readings_tenant_branch_date_key').on(t.tenantId, t.branchId, t.businessDate).nullsNotDistinct(),
    index('z_readings_tenant_business_date_idx').on(t.tenantId, t.businessDate.desc()),
    check(
      'z_readings_amounts_non_negative',
      sql`${t.beginningGt} >= 0 AND ${t.endingGt} >= 0 AND ${t.grossSales} >= 0 AND ${t.vatableSales} >= 0 AND ${t.vatAmount} >= 0 AND ${t.vatExemptSales} >= 0 AND ${t.zeroRatedSales} >= 0 AND ${t.discountTotal} >= 0 AND ${t.transactionCount} >= 0 AND ${t.voidCount} >= 0`
    ),
  ]
);
