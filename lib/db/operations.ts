/**
 * Domain 6 (operations): bookings, recurring booking templates, staff
 * attendance, cash drawer sessions and BIR Z-Readings.
 *
 * Every method takes `tenantId` first and scopes by it. The system-health
 * counts accept `null` for "every tenant" (`countOpen(null)`).
 */
import type { DbTx } from './tx';
import type { Id, Patch, Ref, UpdateResult, UserSummary } from './types';
import type { Select } from './identity';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

type DateRange = { gt?: Date; gte?: Date; lt?: Date; lte?: Date };

// ─── Bookings ───────────────────────────────────────────────────────────────

export const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface Booking extends Timestamps {
  _id: Id;
  tenantId: Id;
  customerName: string;
  /** Stored lowercased and trimmed. */
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  serviceDescription?: string;
  startTime: Date;
  /** Always startTime + duration when either of them is written. */
  endTime: Date;
  /** Minutes. */
  duration: number;
  status: BookingStatus;
  staffId?: Id;
  /** Filled from the user when staffId is written. */
  staffName?: string;
  notes?: string;
  reminderSent: boolean;
  confirmationSent: boolean;
  isActive: boolean;
}

/** A booking read with `populateStaff`: staffId is `{ _id, name, email }`, or null when the user is gone. */
export type BookingWithStaff = Omit<Booking, 'staffId'> & { staffId?: Ref<UserSummary> };

export type BookingFields = Omit<Booking, '_id' | 'tenantId' | keyof Timestamps>;

export type BookingInput = Pick<BookingFields, 'customerName' | 'serviceName' | 'startTime' | 'endTime' | 'duration'> &
  Partial<BookingFields>;

export interface BookingFilter {
  ids?: Id[];
  excludeId?: Id;
  status?: BookingStatus | BookingStatus[];
  /** None of these statuses. */
  notStatus?: BookingStatus[];
  /** isActive !== false. */
  notDisabled?: true;
  staffId?: Id;
  startTime?: DateRange;
  /** startTime is exactly one of these. */
  startTimeIn?: Date[];
  endTime?: DateRange;
  /** Bookings that overlap the half-open interval [start, end). */
  overlaps?: { start: Date; end: Date };
  customerEmail?: string;
  /**
   * Bookings of one customer: the email or the phone matches. Only the values
   * that are set are compared, and with neither set nothing matches, so a
   * customer without an email never sees other bookings without an email.
   */
  customerContact?: { email?: string; phone?: string };
  /** reminderSent !== true. */
  reminderNotSent?: true;
}

export interface BookingRepo {
  list(
    tenantId: Id,
    filter?: BookingFilter,
    opts?: { select?: Select; sort?: 'startTime' | '-startTime'; populateStaff?: boolean; tx?: DbTx }
  ): Promise<BookingWithStaff[]>;
  /** The first match (no particular order). */
  findOne(tenantId: Id, filter: BookingFilter): Promise<Booking | null>;
  findById(tenantId: Id, id: Id, opts?: { populateStaff?: boolean }): Promise<BookingWithStaff | null>;
  /**
   * Computes endTime and staffName, and throws when endTime isn't after
   * startTime or an active staff booking overlaps.
   */
  create(tenantId: Id, input: BookingInput, opts?: { tx?: DbTx }): Promise<Booking>;
  /** Loads and saves, with the same rules as create() for changed times and staff. `null` clears a field. */
  update(tenantId: Id, id: Id, patch: Patch<BookingFields>, opts?: { tx?: DbTx }): Promise<UpdateResult<Booking> | null>;
  /** Flag and status writes only: no time or overlap rules run. Returns how many changed. */
  updateMany(
    tenantId: Id,
    filter: BookingFilter,
    set: Partial<Pick<BookingFields, 'status' | 'reminderSent' | 'confirmationSent'>>
  ): Promise<number>;
}

// ─── Recurring booking templates ────────────────────────────────────────────

export interface RecurringBookingTemplate extends Timestamps {
  _id: Id;
  tenantId: Id;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  serviceDescription?: string;
  staffId?: Id;
  staffName?: string;
  duration: number;
  startTimeHour: number;
  startTimeMinute: number;
  recurrenceType: 'daily' | 'weekly' | 'monthly';
  /** 0 (Sunday) to 6. */
  daysOfWeek: number[];
  dayOfMonth?: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  notes?: string;
  isActive: boolean;
}

export interface RecurringBookingTemplateRepo {
  /** Active templates whose effective period contains `at` (a missing effectiveTo never ends). */
  listEffective(tenantId: Id, at: Date): Promise<RecurringBookingTemplate[]>;
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export interface Attendance extends Timestamps {
  _id: Id;
  userId: Id;
  tenantId: Id;
  clockIn: Date;
  clockOut?: Date;
  breakStart?: Date;
  breakEnd?: Date;
  /** Worked hours minus the break, computed when a record with clockOut is saved. */
  totalHours?: number;
  notes?: string;
  location?: { latitude?: number; longitude?: number; address?: string };
  isActive: boolean;
}

/** An attendance record read with `populateUser`: userId is `{ _id, name, email }`, or null when the user is gone. */
export type AttendanceWithUser = Omit<Attendance, 'userId'> & { userId: Ref<UserSummary> };

export type AttendanceFields = Pick<Attendance, 'clockOut' | 'breakStart' | 'breakEnd' | 'totalHours' | 'notes'>;

export interface AttendanceFilter {
  userId?: Id;
  /** clockOut is not set. */
  open?: true;
  /** isActive !== false. */
  notDisabled?: true;
  clockIn?: DateRange;
}

export interface AttendanceRepo {
  /** Latest clock-in first. */
  list(
    tenantId: Id,
    filter?: AttendanceFilter,
    opts?: { select?: Select; populateUser?: boolean; limit?: number }
  ): Promise<AttendanceWithUser[]>;
  /** The user's open session, if any. */
  findOpen(tenantId: Id, userId: Id): Promise<Attendance | null>;
  /** Open sessions, optionally only those clocked in before `clockInBefore`. `null` counts every tenant. */
  countOpen(tenantId: Id | null, opts?: { clockInBefore?: Date }): Promise<number>;
  /** Throws DuplicateKeyError when the user already has an open session. */
  clockIn(tenantId: Id, input: Pick<Attendance, 'userId' | 'clockIn' | 'notes' | 'location'>): Promise<Attendance>;
  /** Loads and saves, so totalHours is computed. */
  update(tenantId: Id, id: Id, patch: Patch<AttendanceFields>): Promise<UpdateResult<Attendance> | null>;
  /**
   * Different fields per record, in one unordered batch, with no totalHours
   * computation. `ifOpen` skips a record that was clocked out meanwhile.
   */
  updateEach(tenantId: Id, updates: Array<{ id: Id; set: Partial<AttendanceFields>; ifOpen?: boolean }>): Promise<void>;
}

// ─── Cash drawer sessions ───────────────────────────────────────────────────

export interface CashDrawerSession extends Timestamps {
  _id: Id;
  tenantId: Id;
  userId: Id;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  openingTime: Date;
  closingTime?: Date;
  status: 'open' | 'closed';
  notes?: string;
  totalVAT: number;
  totalDiscounts: number;
}

/** A session read with `populateUser`: userId is `{ _id, name, email }`, or null when the user is gone. */
export type CashDrawerSessionWithUser = Omit<CashDrawerSession, 'userId'> & { userId: Ref<UserSummary> };

export type CashDrawerClosing = Pick<CashDrawerSession, 'closingAmount' | 'expectedAmount' | 'closingTime' | 'totalVAT' | 'totalDiscounts'> &
  Partial<Pick<CashDrawerSession, 'shortage' | 'overage' | 'notes'>>;

export interface CashDrawerSessionRepo {
  /** Latest opening first. */
  list(
    tenantId: Id,
    filter?: { status?: CashDrawerSession['status']; userIds?: Id[] },
    opts?: { select?: Select; populateUser?: boolean; page?: { skip: number; limit: number } }
  ): Promise<CashDrawerSessionWithUser[]>;
  count(tenantId: Id, filter?: { status?: CashDrawerSession['status'] }): Promise<number>;
  /** The tenant's open session, or that user's when `userId` is given. */
  findOpen(tenantId: Id, opts?: { userId?: Id }): Promise<CashDrawerSession | null>;
  /** Open sessions. `null` counts every tenant. */
  countOpen(tenantId: Id | null): Promise<number>;
  /** Sessions closed since `since` with at least this shortage or overage. */
  countDiscrepanciesSince(tenantId: Id, since: Date, threshold: { shortage: number; overage: number }): Promise<number>;
  /** Throws DuplicateKeyError when the tenant already has an open session. */
  open(tenantId: Id, input: Pick<CashDrawerSession, 'userId' | 'openingAmount' | 'openingTime' | 'notes'>): Promise<CashDrawerSession>;
  /** Atomically closes an open session. Null when it isn't open any more. */
  close(tenantId: Id, id: Id, closing: CashDrawerClosing): Promise<CashDrawerSession | null>;
  /** Closes several sessions in one unordered batch, skipping any closed meanwhile. */
  closeEach(tenantId: Id, closings: Array<{ id: Id; closing: CashDrawerClosing }>): Promise<void>;
}

// ─── Z-Readings ─────────────────────────────────────────────────────────────

/** BIR end-of-day report: immutable once written, so there is no update. */
export interface ZReading extends Timestamps {
  _id: Id;
  tenantId: Id;
  branchId?: Id;
  businessDate: Date;
  beginningGT: number;
  endingGT: number;
  grossSales: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  discountTotal: number;
  transactionCount: number;
  voidCount: number;
  generatedBy: Id;
  generatedAt: Date;
}

/** generatedBy is `{ _id, name, email }`, or null when the user is gone. */
export type ZReadingWithUser = Omit<ZReading, 'generatedBy'> & { generatedBy: Ref<UserSummary> };

export type ZReadingInput = Omit<ZReading, '_id' | 'tenantId' | keyof Timestamps>;

export interface ZReadingRepo {
  /** Latest business date first. */
  list(tenantId: Id, opts: { limit: number }): Promise<ZReadingWithUser[]>;
  findByBusinessDate(tenantId: Id, businessDate: Date): Promise<ZReadingWithUser | null>;
  /** Throws DuplicateKeyError when the day already has a reading. */
  create(tenantId: Id, input: ZReadingInput): Promise<ZReading>;
}

export interface OperationsRepos {
  bookings: BookingRepo;
  recurringBookingTemplates: RecurringBookingTemplateRepo;
  attendance: AttendanceRepo;
  cashDrawerSessions: CashDrawerSessionRepo;
  zReadings: ZReadingRepo;
}
