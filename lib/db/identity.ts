/**
 * Domain 2 (identity): tenants, users, token revocation, customer OTPs,
 * customer addresses.
 *
 * Tenants and users are the two entities that are not tenant-scoped by a
 * `tenantId` argument: a tenant *is* the scope, and users are looked up by
 * id/email during authentication before a tenant is known. Every method that
 * can return another tenant's user takes the tenantId it must match.
 */
import type { ITenantSettings, OnboardingStatus } from '@/models/Tenant';
import type { DbTx } from './tx';
import type { Id, Patch, Ref, UpdateResult } from './types';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Space-separated field list, Mongoose `.select()` syntax, including dotted
 * settings paths: 'slug name settings.timezone'. A projection is a read-cost
 * hint: callers must only read the fields they selected. `_id` is always
 * returned.
 */
export type Select = string;

// ─── Tenants ────────────────────────────────────────────────────────────────

export interface Tenant extends Timestamps {
  _id: Id;
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  settings: ITenantSettings;
  isActive: boolean;
  onboardingStatus: OnboardingStatus;
  notes?: string;
  createdBy?: Id;
  grandTotalSales?: number;
  grandTotalTransactionCount?: number;
}

export type TenantInput = Pick<Tenant, 'slug' | 'name'> &
  Partial<Pick<Tenant, 'domain' | 'subdomain' | 'isActive' | 'onboardingStatus' | 'notes' | 'createdBy'>> & {
    settings?: Partial<ITenantSettings>;
  };

/** A top-level tenant field or a dotted path inside settings: 'settings.timezone'. */
export type TenantPath = keyof TenantInput | `settings.${string}`;

/**
 * Update operations on one tenant. Array operations work on arrays of
 * objects inside settings that are keyed by an `id` field (holidays, receipt
 * templates). All operations in one call are applied atomically.
 */
export interface TenantUpdate {
  set?: Partial<Record<TenantPath, unknown>>;
  unset?: TenantPath[];
  /** Appends an item to a settings array: { 'settings.holidays': holiday }. */
  push?: Partial<Record<`settings.${string}`, unknown>>;
  /** Removes the items with this id from a settings array. */
  pull?: Partial<Record<`settings.${string}`, { id: string }>>;
  /** Sets fields on every item of a settings array. */
  setOnAllItems?: { path: `settings.${string}`; set: Record<string, unknown> };
  /**
   * Sets/unsets fields on the item with this id. If no item has the id, the
   * whole update is not applied and update() returns null.
   */
  setOnItem?: {
    path: `settings.${string}`;
    id: string;
    set?: Record<string, unknown>;
    unset?: string[];
    /** Replaces the whole item instead (set/unset are ignored). */
    replace?: Record<string, unknown>;
  };
}

export interface TenantListPage {
  skip: number;
  limit: number;
}

export interface TenantRepo {
  findById(id: Id, opts?: { select?: Select; tx?: DbTx }): Promise<Tenant | null>;
  /** `activeOnly` keeps only tenants with isActive === true. */
  findBySlug(slug: string, opts?: { select?: Select; activeOnly?: boolean }): Promise<Tenant | null>;
  /** Active (isActive === true) tenant by slug, or by id when `slugOrId` is a 24-hex id. */
  findActiveBySlugOrId(slugOrId: string, opts?: { select?: Select }): Promise<Tenant | null>;
  /** Active tenant whose subdomain or custom domain matches. */
  findActiveByHost(subdomain: string, host: string, opts?: { select?: Select }): Promise<Tenant | null>;
  /** Tenants that are not explicitly disabled (isActive !== false), for automations and admin lists. */
  listActive(opts?: { select?: Select }): Promise<Tenant[]>;
  countActive(): Promise<number>;
  /** isActive === true (the super-admin stats count; differs from countActive only for legacy documents). */
  countFlaggedActive(): Promise<number>;
  countAll(): Promise<number>;
  /** Super-admin tenant list: name/slug substring search, newest first. */
  search(
    filter: { search?: string; isActive?: boolean },
    page: TenantListPage,
    opts?: { select?: Select }
  ): Promise<{ items: Tenant[]; total: number }>;
  /** Public store directory: active tenants, optional case-insensitive exact businessType. */
  listDirectory(filter: { businessType?: string }, opts: { select: Select }): Promise<Tenant[]>;
  /** Active retail/general stores, name substring search, sorted by name. */
  searchRetailStores(
    filter: { search?: string },
    page: TenantListPage,
    opts: { select: Select }
  ): Promise<{ items: Tenant[]; total: number }>;
  /** Throws DuplicateKeyError for a taken slug, domain or subdomain. */
  create(input: TenantInput, opts?: { tx?: DbTx }): Promise<Tenant>;
  /**
   * Applies `ops` (schema validators run on the written paths) and returns the updated tenant, or null
   * when the tenant (or the `setOnItem` item) doesn't exist. Invalidates the
   * tenant caches.
   */
  update(id: Id, ops: TenantUpdate, opts?: { tx?: DbTx }): Promise<Tenant | null>;
  /**
   * BIR grand-total accumulator: adds one sale. Atomic, and never decremented
   * on a void or refund. Doesn't flush the tenant cache.
   */
  addToGrandTotals(id: Id, amount: number, opts?: { tx?: DbTx }): Promise<void>;
}

// ─── Users ──────────────────────────────────────────────────────────────────

export const USER_ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** A user as the API sees it. The password hash is never part of it. */
export interface User extends Timestamps {
  _id: Id;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: Id;
  branchId?: Id;
  isActive: boolean;
  lastLogin?: Date;
  qrToken?: string;
}

export type UserWithTenant = Omit<User, 'tenantId'> & { tenantId?: Ref<{ slug: string; name: string }> };

/** Returned only by the `...ForLogin` methods; pass it to verifyPassword(). */
export type UserWithPassword = User & { password: string };

/** `password` is the plain password; the repository hashes it. */
export type UserInput = Pick<User, 'email' | 'name'> &
  Partial<Pick<User, 'role' | 'tenantId' | 'branchId' | 'isActive'>> & { password: string };

export type UserPatch = Patch<Omit<UserInput, 'tenantId'>>;

export interface UserRepo {
  findById(id: Id, opts?: { select?: Select }): Promise<User | null>;
  /** The user only if it belongs to `tenantId`. */
  findInTenant(tenantId: Id, id: Id, opts?: { select?: Select; activeOnly?: boolean }): Promise<User | null>;
  /**
   * Looks up by (lowercased) email. `tenantId` narrows to one tenant;
   * `{ role: 'super_admin' }` finds platform admins. Email is globally unique.
   */
  findByEmail(email: string, scope?: { tenantId?: Id; role?: UserRole; excludeId?: Id }): Promise<User | null>;
  /** Same lookups, with the password hash, for authentication only. */
  findByEmailForLogin(email: string, scope: { tenantId: Id } | { role: 'super_admin' }): Promise<UserWithPassword | null>;
  findByIdForLogin(id: Id): Promise<UserWithPassword | null>;
  /** Active user with this QR login token in the tenant. */
  findByQrToken(tenantId: Id, qrToken: string): Promise<User | null>;
  /** An active user in the tenant with one of these roles (no particular order). */
  findFirstActiveByRole(tenantId: Id, roles: UserRole[]): Promise<User | null>;
  /** Newest first. `active: true` keeps isActive !== false; `active: false` keeps isActive === false. */
  list(tenantId: Id, filter?: { active?: boolean }): Promise<User[]>;
  /** Super-admin user list (never super admins): newest first, tenant populated with slug and name. */
  search(
    filter: { role?: UserRole; search?: string; tenantId?: Id },
    page: { skip: number; limit: number }
  ): Promise<{ items: UserWithTenant[]; total: number }>;
  findByIdWithTenant(id: Id): Promise<UserWithTenant | null>;
  /** isActive === true users in the tenant. */
  countActive(tenantId: Id): Promise<number>;
  /** id and lastLogin of the isActive === true users (session-expiration automation). */
  listActiveLogins(tenantId: Id): Promise<Pick<User, '_id' | 'lastLogin'>[]>;
  /** Active owners/admins in the tenant other than `excludeId` (last-admin guard). */
  countOtherActiveAdmins(tenantId: Id, excludeId: Id): Promise<number>;
  countAllExceptSuperAdmins(): Promise<number>;
  /** Hashes the password and generates a qrToken. Throws DuplicateKeyError for a taken email. */
  create(input: UserInput, opts?: { tx?: DbTx }): Promise<User>;
  /**
   * Updates a user, hashing `password` when present. `tenantId` restricts the
   * update to that tenant (omit only for super-admin and self-service calls
   * on an authenticated user id). Invalidates the user cache.
   */
  update(id: Id, patch: UserPatch, opts?: { tenantId?: Id; select?: Select }): Promise<UpdateResult<User> | null>;
  touchLastLogin(id: Id): Promise<void>;
  setQrToken(id: Id, qrToken: string): Promise<void>;
  /** Hard delete within the tenant. */
  delete(tenantId: Id, id: Id): Promise<boolean>;
  /** bcrypt comparison against the stored hash. */
  verifyPassword(user: UserWithPassword, candidate: string): Promise<boolean>;
}

// ─── Token revocation ───────────────────────────────────────────────────────

export interface TokenRevocationRepo {
  /** False while the database is not connected; callers then rely on the in-memory store. */
  isReady(): boolean;
  revokeToken(tokenHash: string, reason: string, expiresAt: Date): Promise<void>;
  findRevokedToken(tokenHash: string): Promise<{ reason: string; expiresAt: Date } | null>;
  revokeUserTokensBefore(userId: Id, before: Date): Promise<void>;
  findUserRevocation(userId: Id): Promise<{ revokedBefore: Date } | null>;
}

// ─── Customer OTPs ──────────────────────────────────────────────────────────

export interface CustomerOtp {
  _id: Id;
  tenantId: Id;
  phone: string;
  otp: string;
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  createdAt: Date;
}

export interface CustomerOtpRepo {
  /** Any OTP for the phone created at or after `since` (resend rate limit). */
  findCreatedSince(tenantId: Id, phone: string, since: Date): Promise<CustomerOtp | null>;
  /** Marks every unverified OTP of the phone as used. */
  invalidateAll(tenantId: Id, phone: string): Promise<void>;
  create(tenantId: Id, input: Pick<CustomerOtp, 'phone' | 'otp' | 'expiresAt'>): Promise<CustomerOtp>;
  /** Unverified, unexpired OTP with this code. */
  findValid(tenantId: Id, phone: string, otp: string, now: Date): Promise<CustomerOtp | null>;
  /** Counts a failed attempt on one unverified OTP of the phone. */
  recordFailedAttempt(tenantId: Id, phone: string): Promise<void>;
  markVerified(tenantId: Id, id: Id): Promise<void>;
}

// ─── Customer addresses (owned by a user) ───────────────────────────────────

export interface Address extends Timestamps {
  _id: Id;
  userId: Id;
  tenantId: Id;
  label: string;
  street: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  isDefault: boolean;
  isActive: boolean;
}

export type AddressInput = Pick<Address, 'street' | 'city' | 'country'> &
  Partial<Pick<Address, 'label' | 'state' | 'zipCode' | 'isDefault'>>;

/** Addresses are scoped by their owner: (tenantId, userId) for lists, userId for single rows. */
export interface AddressRepo {
  /** All of the user's addresses in the tenant (active and inactive). */
  countForUser(tenantId: Id, userId: Id): Promise<number>;
  create(tenantId: Id, userId: Id, input: AddressInput): Promise<Address>;
  /** The address only if `userId` owns it. */
  findOwned(userId: Id, id: Id, opts?: { activeOnly?: boolean }): Promise<Address | null>;
  update(userId: Id, id: Id, patch: Patch<AddressInput>): Promise<Address | null>;
  softDelete(userId: Id, id: Id): Promise<Address | null>;
  /** Clears isDefault on the user's other addresses in the tenant. */
  clearDefault(tenantId: Id, userId: Id, exceptId?: Id): Promise<void>;
  /** The user's most recently created active address in the tenant. */
  findFirstActive(tenantId: Id, userId: Id): Promise<Address | null>;
}

export interface IdentityRepos {
  tenants: TenantRepo;
  users: UserRepo;
  tokenRevocations: TokenRevocationRepo;
  customerOtps: CustomerOtpRepo;
  addresses: AddressRepo;
}
