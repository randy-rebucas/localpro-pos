/**
 * Mongo implementation of the operations repositories (lib/db/operations.ts).
 * Booking's endTime/overlap/staffName logic and Attendance's totalHours are
 * still the models' pre-save hooks, so writes that need them load and save.
 */
import BookingModel from '@/models/Booking';
import RecurringBookingTemplateModel from '@/models/RecurringBookingTemplate';
import AttendanceModel from '@/models/Attendance';
import CashDrawerSessionModel from '@/models/CashDrawerSession';
import ZReadingModel from '@/models/ZReading';
import '@/models/User'; // registers the schema for populate('userId' / 'staffId' / 'generatedBy')
import type * as O from '../operations';
import { applyPatch, run, sessionOf } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

const USER_FIELDS = 'name email';

function rangeQuery(range: { gt?: Date; gte?: Date; lt?: Date; lte?: Date }) {
  return Object.fromEntries(
    (['gt', 'gte', 'lt', 'lte'] as const).filter((k) => range[k] !== undefined).map((k) => [`$${k}`, range[k]])
  );
}

// ─── Bookings ───────────────────────────────────────────────────────────────

function bookingQuery(tenantId: string, f: O.BookingFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = { tenantId };
  if (f.ids || f.excludeId) q._id = { ...(f.ids && { $in: f.ids }), ...(f.excludeId && { $ne: f.excludeId }) };
  if (f.status) q.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
  else if (f.notStatus) q.status = { $nin: f.notStatus };
  if (f.notDisabled) q.isActive = { $ne: false };
  if (f.staffId) q.staffId = f.staffId;
  if (f.startTimeIn) q.startTime = { $in: f.startTimeIn };
  else if (f.startTime) q.startTime = rangeQuery(f.startTime);
  if (f.endTime) q.endTime = rangeQuery(f.endTime);
  if (f.overlaps) {
    q.startTime = { $lt: f.overlaps.end };
    q.endTime = { $gt: f.overlaps.start };
  }
  if (f.customerEmail !== undefined) q.customerEmail = f.customerEmail;
  if (f.customerContact) {
    const { email, phone } = f.customerContact;
    // An undefined value would reach Mongo as null and match every booking without one
    const contacts = [...(email ? [{ customerEmail: email }] : []), ...(phone ? [{ customerPhone: phone }] : [])];
    q.$or = contacts.length ? contacts : [{ _id: { $in: [] } }];
  }
  if (f.reminderNotSent) q.reminderSent = { $ne: true };
  return q;
}

const bookings: O.BookingRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = BookingModel.find(bookingQuery(tenantId, filter)).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      if (opts.populateStaff) query.populate('staffId', USER_FIELDS);
      if (opts.sort) query.sort({ startTime: opts.sort === 'startTime' ? 1 : -1 });
      return toApiList<O.BookingWithStaff>(await query.lean());
    }),

  findOne: (tenantId, filter) =>
    run(async () => toApiOrNull<O.Booking>(await BookingModel.findOne(bookingQuery(tenantId, filter)).lean())),

  findById: (tenantId, id, opts = {}) =>
    run(async () => {
      const query = BookingModel.findOne({ _id: id, tenantId });
      if (opts.populateStaff) query.populate('staffId', USER_FIELDS);
      return toApiOrNull<O.BookingWithStaff>(await query.lean());
    }),

  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await BookingModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<O.Booking>(doc);
    }),

  update: (tenantId, id, patch, opts = {}) =>
    run(async () => {
      const session = sessionOf(opts.tx);
      const doc = await BookingModel.findOne({ _id: id, tenantId }).session(session ?? null);
      return doc ? applyPatch<O.Booking>(doc, patch, session) : null;
    }),

  updateMany: (tenantId, filter, set) =>
    run(async () => (await BookingModel.updateMany(bookingQuery(tenantId, filter), { $set: set })).modifiedCount),
};

// ─── Recurring booking templates ────────────────────────────────────────────

const recurringBookingTemplates: O.RecurringBookingTemplateRepo = {
  listEffective: (tenantId, at) =>
    run(async () =>
      toApiList<O.RecurringBookingTemplate>(
        await RecurringBookingTemplateModel.find({
          tenantId,
          isActive: true,
          effectiveFrom: { $lte: at },
          $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: at } }],
        }).lean()
      )
    ),
};

// ─── Attendance ─────────────────────────────────────────────────────────────

function attendanceQuery(tenantId: string, f: O.AttendanceFilter = {}): Record<string, unknown> {
  return {
    tenantId,
    ...(f.userId && { userId: f.userId }),
    ...(f.open && { clockOut: null }),
    ...(f.notDisabled && { isActive: { $ne: false } }),
    ...(f.clockIn && { clockIn: rangeQuery(f.clockIn) }),
  };
}

const attendance: O.AttendanceRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = AttendanceModel.find(attendanceQuery(tenantId, filter)).sort({ clockIn: -1 });
      if (opts.select) query.select(opts.select);
      if (opts.populateUser) query.populate('userId', USER_FIELDS);
      if (opts.limit) query.limit(opts.limit);
      return toApiList<O.AttendanceWithUser>(await query.lean());
    }),

  findOpen: (tenantId, userId) =>
    run(async () =>
      toApiOrNull<O.Attendance>(await AttendanceModel.findOne({ userId, tenantId, clockOut: null }).sort({ clockIn: -1 }).lean())
    ),

  countOpen: (tenantId, opts = {}) =>
    run(() =>
      AttendanceModel.countDocuments({
        ...(tenantId && { tenantId }),
        clockOut: null,
        ...(opts.clockInBefore && { clockIn: { $lt: opts.clockInBefore } }),
      })
    ),

  clockIn: (tenantId, input) => run(async () => toApi<O.Attendance>(await AttendanceModel.create({ ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await AttendanceModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<O.Attendance>(doc, patch) : null;
    }),

  updateEach: (tenantId, updates) =>
    run(async () => {
      if (updates.length === 0) return;
      await AttendanceModel.bulkWrite(
        updates.map(({ id, set, ifOpen }) => ({
          updateOne: { filter: { _id: id, tenantId, ...(ifOpen && { clockOut: null }) }, update: { $set: set } },
        })) as Parameters<typeof AttendanceModel.bulkWrite>[0],
        { ordered: false }
      );
    }),
};

// ─── Cash drawer sessions ───────────────────────────────────────────────────

const closedSet = (closing: O.CashDrawerClosing) => ({ ...closing, status: 'closed' });

const cashDrawerSessions: O.CashDrawerSessionRepo = {
  list: (tenantId, filter = {}, opts = {}) =>
    run(async () => {
      const query = CashDrawerSessionModel.find({
        tenantId,
        ...(filter.status && { status: filter.status }),
        ...(filter.userIds && { userId: { $in: filter.userIds } }),
      }).sort({ openingTime: -1 });
      if (opts.select) query.select(opts.select);
      if (opts.populateUser) query.populate('userId', USER_FIELDS);
      if (opts.page) query.skip(opts.page.skip).limit(opts.page.limit);
      return toApiList<O.CashDrawerSessionWithUser>(await query.lean());
    }),

  count: (tenantId, filter = {}) =>
    run(() => CashDrawerSessionModel.countDocuments({ tenantId, ...(filter.status && { status: filter.status }) })),

  findOpen: (tenantId, opts = {}) =>
    run(async () =>
      toApiOrNull<O.CashDrawerSession>(
        await CashDrawerSessionModel.findOne({ tenantId, status: 'open', ...(opts.userId && { userId: opts.userId }) }).lean()
      )
    ),

  countOpen: (tenantId) => run(() => CashDrawerSessionModel.countDocuments({ ...(tenantId && { tenantId }), status: 'open' })),

  countDiscrepanciesSince: (tenantId, since, threshold) =>
    run(() =>
      CashDrawerSessionModel.countDocuments({
        tenantId,
        closingTime: { $gte: since },
        $or: [{ shortage: { $gte: threshold.shortage } }, { overage: { $gte: threshold.overage } }],
      })
    ),

  open: (tenantId, input) =>
    run(async () => toApi<O.CashDrawerSession>(await CashDrawerSessionModel.create({ ...input, status: 'open', tenantId }))),

  close: (tenantId, id, closing) =>
    run(async () =>
      toApiOrNull<O.CashDrawerSession>(
        await CashDrawerSessionModel.findOneAndUpdate(
          { _id: id, tenantId, status: 'open' },
          { $set: closedSet(closing) },
          { new: true }
        ).lean()
      )
    ),

  closeEach: (tenantId, closings) =>
    run(async () => {
      if (closings.length === 0) return;
      await CashDrawerSessionModel.bulkWrite(
        closings.map(({ id, closing }) => ({
          updateOne: { filter: { _id: id, tenantId, status: 'open' }, update: { $set: closedSet(closing) } },
        })) as Parameters<typeof CashDrawerSessionModel.bulkWrite>[0],
        { ordered: false }
      );
    }),
};

// ─── Z-Readings ─────────────────────────────────────────────────────────────

const zReadings: O.ZReadingRepo = {
  list: (tenantId, opts) =>
    run(async () =>
      toApiList<O.ZReadingWithUser>(
        await ZReadingModel.find({ tenantId }).sort({ businessDate: -1 }).limit(opts.limit).populate('generatedBy', USER_FIELDS).lean()
      )
    ),

  findByBusinessDate: (tenantId, businessDate) =>
    run(async () =>
      toApiOrNull<O.ZReadingWithUser>(
        await ZReadingModel.findOne({ tenantId, businessDate }).populate('generatedBy', USER_FIELDS).lean()
      )
    ),

  create: (tenantId, input) => run(async () => toApi<O.ZReading>(await ZReadingModel.create({ ...input, tenantId }))),
};

export const mongoOperationsRepos: O.OperationsRepos = {
  bookings,
  recurringBookingTemplates,
  attendance,
  cashDrawerSessions,
  zReadings,
};
