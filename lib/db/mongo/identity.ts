/**
 * Mongo implementation of the identity repositories (lib/db/identity.ts).
 * Cache invalidation still happens in the Tenant/User model hooks.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import TenantModel from '@/models/Tenant';
import UserModel from '@/models/User';
import CustomerOTPModel from '@/models/CustomerOTP';
import AddressModel from '@/models/Address';
import type * as I from '../identity';
import { applyPatch, escapeRegex, run, sessionOf } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';
import { RevokedTokenModel, UserRevocationModel } from './token-models';

// ─── Tenants ────────────────────────────────────────────────────────────────

/** Missing isActive counts as active (Mongoose default for documents that never stored it). */
const NOT_DISABLED = { isActive: { $ne: false } } as const;

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;

/** Translates a TenantUpdate into a Mongo update document, filter additions and arrayFilters. */
function tenantUpdateDoc(ops: I.TenantUpdate) {
  const update: Record<string, Record<string, unknown>> = {};
  const filter: Record<string, unknown> = {};
  const arrayFilters: Record<string, unknown>[] = [];
  const add = (op: string, path: string, value: unknown) => {
    (update[op] ??= {})[path] = value;
  };

  for (const [path, value] of Object.entries(ops.set ?? {})) add('$set', path, value);
  for (const path of ops.unset ?? []) add('$unset', path, '');
  for (const [path, item] of Object.entries(ops.push ?? {})) add('$push', path, item);
  for (const [path, match] of Object.entries(ops.pull ?? {})) add('$pull', path, { id: match!.id });
  if (ops.setOnAllItems) {
    for (const [field, value] of Object.entries(ops.setOnAllItems.set)) add('$set', `${ops.setOnAllItems.path}.$[].${field}`, value);
  }
  if (ops.setOnItem) {
    const { path, id, set = {}, unset = [], replace } = ops.setOnItem;
    filter[`${path}.id`] = id; // no match → nothing updated, update() returns null
    if (replace) {
      add('$set', `${path}.$`, replace);
    } else {
      arrayFilters.push({ 'item.id': id });
      for (const [field, value] of Object.entries(set)) add('$set', `${path}.$[item].${field}`, value);
      for (const field of unset) add('$unset', `${path}.$[item].${field}`, '');
    }
  }
  return { update, filter, arrayFilters };
}

const tenants: I.TenantRepo = {
  findById: (id, opts = {}) =>
    run(async () => {
      const query = TenantModel.findById(id).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      return toApiOrNull<I.Tenant>(await query.lean());
    }),

  findBySlug: (slug, opts = {}) =>
    run(async () => {
      const query = TenantModel.findOne({ slug, ...(opts.activeOnly && { isActive: true }) });
      if (opts.select) query.select(opts.select);
      return toApiOrNull<I.Tenant>(await query.lean());
    }),

  findActiveBySlugOrId: (slugOrId, opts = {}) =>
    run(async () => {
      const query = TenantModel.findOne({
        $or: [{ slug: slugOrId }, ...(OBJECT_ID_HEX.test(slugOrId) ? [{ _id: slugOrId }] : [])],
        isActive: true,
      });
      if (opts.select) query.select(opts.select);
      return toApiOrNull<I.Tenant>(await query.lean());
    }),

  findActiveByHost: (subdomain, host, opts = {}) =>
    run(async () => {
      const query = TenantModel.findOne({ $or: [{ subdomain }, { domain: host }], isActive: true });
      if (opts.select) query.select(opts.select);
      return toApiOrNull<I.Tenant>(await query.lean());
    }),

  listActive: (opts = {}) =>
    run(async () => {
      const query = TenantModel.find(NOT_DISABLED);
      if (opts.select) query.select(opts.select);
      return toApiList<I.Tenant>(await query.lean());
    }),

  countActive: () => run(() => TenantModel.countDocuments(NOT_DISABLED)),
  countFlaggedActive: () => run(() => TenantModel.countDocuments({ isActive: true })),
  countAll: () => run(() => TenantModel.estimatedDocumentCount()),

  search: (filter, page, opts = {}) =>
    run(async () => {
      const query: Record<string, unknown> = {};
      if (filter.search) {
        query.$or = [
          { name: { $regex: filter.search, $options: 'i' } },
          { slug: { $regex: filter.search, $options: 'i' } },
        ];
      }
      if (filter.isActive !== undefined) query.isActive = filter.isActive;
      const total = await TenantModel.countDocuments(query);
      const find = TenantModel.find(query).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit);
      if (opts.select) find.select(opts.select);
      return { items: toApiList<I.Tenant>(await find.lean()), total };
    }),

  listDirectory: (filter, opts) =>
    run(async () => {
      const query: Record<string, unknown> = { ...NOT_DISABLED };
      if (filter.businessType) query['settings.businessType'] = new RegExp(`^${escapeRegex(filter.businessType)}$`, 'i');
      return toApiList<I.Tenant>(await TenantModel.find(query).select(opts.select).lean());
    }),

  searchRetailStores: (filter, page, opts) =>
    run(async () => {
      const query: Record<string, unknown> = { isActive: true, 'settings.businessType': { $in: ['retail', 'general'] } };
      if (filter.search) query.name = { $regex: escapeRegex(filter.search), $options: 'i' };
      const [items, total] = await Promise.all([
        TenantModel.find(query).select(opts.select).sort({ name: 1 }).skip(page.skip).limit(page.limit).lean(),
        TenantModel.countDocuments(query),
      ]);
      return { items: toApiList<I.Tenant>(items), total };
    }),

  create: (input, opts = {}) =>
    run(async () => {
      const [doc] = await TenantModel.create([input], { session: sessionOf(opts.tx) });
      return toApi<I.Tenant>(doc);
    }),

  addToGrandTotals: (id, amount, opts = {}) =>
    run(async () => {
      await TenantModel.updateOne(
        { _id: id },
        { $inc: { grandTotalSales: amount, grandTotalTransactionCount: 1 } },
        { session: sessionOf(opts.tx) }
      );
    }),

  update: (id, ops, opts = {}) =>
    run(async () => {
      const { update, filter, arrayFilters } = tenantUpdateDoc(ops);
      return toApiOrNull<I.Tenant>(
        await TenantModel.findOneAndUpdate({ _id: id, ...filter }, update, {
          new: true,
          runValidators: true,
          session: sessionOf(opts.tx),
          ...(arrayFilters.length && { arrayFilters }),
        }).lean()
      );
    }),
};

// ─── Users ──────────────────────────────────────────────────────────────────

const ADMIN_LIST_FIELDS = 'name email role isActive lastLogin createdAt tenantId';

/** Drops the password hash, which a saved document carries after a password change. */
function withoutPassword<T>(user: T): T {
  if (user && typeof user === 'object' && 'password' in user) {
    const { password, ...rest } = user as T & { password?: unknown }; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest as T;
  }
  return user;
}

function pick<T extends object>(obj: T, select?: string): T {
  if (!select) return obj;
  const keys = new Set(['_id', ...select.split(/\s+/).filter(Boolean)]);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => keys.has(k))) as T;
}

function emailScope(email: string, scope: { tenantId?: I.User['tenantId']; role?: I.UserRole; excludeId?: string } = {}) {
  return {
    email: email.toLowerCase(),
    ...(scope.tenantId && { tenantId: scope.tenantId }),
    ...(scope.role && { role: scope.role }),
    ...(scope.excludeId && { _id: { $ne: scope.excludeId } }),
  };
}

const users: I.UserRepo = {
  findById: (id, opts = {}) =>
    run(async () => {
      const query = UserModel.findById(id);
      if (opts.select) query.select(opts.select);
      return toApiOrNull<I.User>(await query.lean());
    }),

  findInTenant: (tenantId, id, opts = {}) =>
    run(async () => {
      const query = UserModel.findOne({ _id: id, tenantId, ...(opts.activeOnly && { isActive: true }) });
      if (opts.select) query.select(opts.select);
      return toApiOrNull<I.User>(await query.lean());
    }),

  findByEmail: (email, scope) => run(async () => toApiOrNull<I.User>(await UserModel.findOne(emailScope(email, scope)).lean())),

  findByEmailForLogin: (email, scope) =>
    run(async () =>
      toApiOrNull<I.UserWithPassword>(await UserModel.findOne(emailScope(email, scope)).select('+password').lean())
    ),

  findByIdForLogin: (id) =>
    run(async () => toApiOrNull<I.UserWithPassword>(await UserModel.findById(id).select('+password').lean())),

  findByQrToken: (tenantId, qrToken) =>
    run(async () => toApiOrNull<I.User>(await UserModel.findOne({ qrToken, tenantId, isActive: true }).lean())),

  findFirstActiveByRole: (tenantId, roles) =>
    run(async () =>
      toApiOrNull<I.User>(
        await UserModel.findOne({ tenantId, role: roles.length === 1 ? roles[0] : { $in: roles }, isActive: true }).lean()
      )
    ),

  list: (tenantId, filter = {}) =>
    run(async () => {
      const query: Record<string, unknown> = { tenantId };
      if (filter.active === true) query.isActive = { $ne: false };
      else if (filter.active === false) query.isActive = false;
      return toApiList<I.User>(await UserModel.find(query).sort({ createdAt: -1 }).lean());
    }),

  search: (filter, page) =>
    run(async () => {
      const query: Record<string, unknown> = { role: filter.role ?? { $ne: 'super_admin' } };
      if (filter.search) {
        query.$or = [
          { name: { $regex: filter.search, $options: 'i' } },
          { email: { $regex: filter.search, $options: 'i' } },
        ];
      }
      if (filter.tenantId) query.tenantId = filter.tenantId;
      const [items, total] = await Promise.all([
        UserModel.find(query)
          .populate('tenantId', 'slug name')
          .select(ADMIN_LIST_FIELDS)
          .sort({ createdAt: -1 })
          .skip(page.skip)
          .limit(page.limit)
          .lean(),
        UserModel.countDocuments(query),
      ]);
      return { items: toApiList<I.UserWithTenant>(items), total };
    }),

  findByIdWithTenant: (id) =>
    run(async () =>
      toApiOrNull<I.UserWithTenant>(
        await UserModel.findById(id).populate('tenantId', 'slug name').select(ADMIN_LIST_FIELDS).lean()
      )
    ),

  countActive: (tenantId) => run(() => UserModel.countDocuments({ tenantId, isActive: true })),

  listActiveLogins: (tenantId) =>
    run(async () =>
      toApiList<Pick<I.User, '_id' | 'lastLogin'>>(
        await UserModel.find({ tenantId, isActive: true }).select('_id lastLogin').lean()
      )
    ),

  countOtherActiveAdmins: (tenantId, excludeId) =>
    run(() =>
      UserModel.countDocuments({
        tenantId,
        _id: { $ne: excludeId },
        isActive: { $ne: false },
        role: { $in: ['owner', 'admin'] },
      })
    ),

  countAllExceptSuperAdmins: () => run(() => UserModel.countDocuments({ role: { $ne: 'super_admin' } })),

  // The model's pre-save hook hashes the password and generates the qrToken
  create: (input, opts = {}) =>
    run(async () => {
      const [doc] = await UserModel.create([input], { session: sessionOf(opts.tx) });
      return withoutPassword(toApi<I.User>(doc));
    }),

  update: (id, patch, opts = {}) =>
    run(async () => {
      const doc = await UserModel.findOne({ _id: id, ...(opts.tenantId && { tenantId: opts.tenantId }) });
      if (!doc) return null;
      // save() runs the pre-save hook, so a patched password is hashed
      const result = await applyPatch<I.User>(doc, patch);
      return {
        before: withoutPassword(result.before),
        after: pick(withoutPassword(result.after), opts.select),
        changed: result.changed,
      };
    }),

  touchLastLogin: (id) =>
    run(async () => {
      await UserModel.findByIdAndUpdate(id, { lastLogin: new Date() });
    }),

  setQrToken: (id, qrToken) =>
    run(async () => {
      await UserModel.findByIdAndUpdate(id, { qrToken });
    }),

  delete: (tenantId, id) => run(async () => !!(await UserModel.findOneAndDelete({ _id: id, tenantId }))),

  verifyPassword: (user, candidate) => bcrypt.compare(candidate, user.password),
};

// ─── Token revocation ───────────────────────────────────────────────────────

const tokenRevocations: I.TokenRevocationRepo = {
  isReady: () => mongoose.connection.readyState === 1,

  revokeToken: (tokenHash, reason, expiresAt) =>
    run(async () => {
      await RevokedTokenModel.updateOne({ tokenHash }, { $set: { reason, expiresAt } }, { upsert: true });
    }),

  findRevokedToken: (tokenHash) =>
    run(async () => {
      const found = await RevokedTokenModel.findOne({ tokenHash }).select('expiresAt reason').lean();
      return found ? { reason: found.reason, expiresAt: found.expiresAt } : null;
    }),

  revokeUserTokensBefore: (userId, before) =>
    run(async () => {
      await UserRevocationModel.updateOne({ userId }, { $set: { revokedBefore: before } }, { upsert: true });
    }),

  findUserRevocation: (userId) =>
    run(async () => {
      const record = await UserRevocationModel.findOne({ userId }).select('revokedBefore').lean();
      return record ? { revokedBefore: record.revokedBefore } : null;
    }),
};

// ─── Customer OTPs ──────────────────────────────────────────────────────────

const customerOtps: I.CustomerOtpRepo = {
  findCreatedSince: (tenantId, phone, since) =>
    run(async () =>
      toApiOrNull<I.CustomerOtp>(await CustomerOTPModel.findOne({ tenantId, phone, createdAt: { $gte: since } }).lean())
    ),

  invalidateAll: (tenantId, phone) =>
    run(async () => {
      await CustomerOTPModel.updateMany({ tenantId, phone, verified: false }, { verified: true });
    }),

  create: (tenantId, input) =>
    run(async () => toApi<I.CustomerOtp>(await CustomerOTPModel.create({ ...input, verified: false, tenantId }))),

  findValid: (tenantId, phone, otp, now) =>
    run(async () =>
      toApiOrNull<I.CustomerOtp>(
        await CustomerOTPModel.findOne({ tenantId, phone, otp, verified: false, expiresAt: { $gt: now } }).lean()
      )
    ),

  recordFailedAttempt: (tenantId, phone) =>
    run(async () => {
      await CustomerOTPModel.updateOne({ tenantId, phone, verified: false }, { $inc: { attempts: 1 } });
    }),

  markVerified: (tenantId, id) =>
    run(async () => {
      await CustomerOTPModel.updateOne({ _id: id, tenantId }, { $set: { verified: true } });
    }),
};

// ─── Addresses ──────────────────────────────────────────────────────────────

const addresses: I.AddressRepo = {
  countForUser: (tenantId, userId) => run(() => AddressModel.countDocuments({ userId, tenantId })),

  create: (tenantId, userId, input) =>
    run(async () => toApi<I.Address>(await AddressModel.create({ ...input, userId, tenantId }))),

  findOwned: (userId, id, opts = {}) =>
    run(async () =>
      toApiOrNull<I.Address>(await AddressModel.findOne({ _id: id, userId, ...(opts.activeOnly && { isActive: true }) }).lean())
    ),

  update: (userId, id, patch) =>
    run(async () => {
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (v === null) unset[k] = 1;
        else set[k] = v;
      }
      return toApiOrNull<I.Address>(
        await AddressModel.findOneAndUpdate(
          { _id: id, userId },
          { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
          { new: true }
        ).lean()
      );
    }),

  softDelete: (userId, id) =>
    run(async () => {
      const doc = await AddressModel.findOne({ _id: id, userId, isActive: true });
      if (!doc) return null;
      doc.isActive = false;
      await doc.save();
      return toApi<I.Address>(doc);
    }),

  clearDefault: (tenantId, userId, exceptId) =>
    run(async () => {
      await AddressModel.updateMany(
        { userId, tenantId, isDefault: true, ...(exceptId && { _id: { $ne: exceptId } }) },
        { $set: { isDefault: false } }
      );
    }),

  findFirstActive: (tenantId, userId) =>
    run(async () =>
      toApiOrNull<I.Address>(await AddressModel.findOne({ userId, tenantId, isActive: true }).sort({ createdAt: -1 }).lean())
    ),
};

export const mongoIdentityRepos: I.IdentityRepos = { tenants, users, tokenRevocations, customerOtps, addresses };
