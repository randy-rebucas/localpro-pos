import mongoose from 'mongoose';
import User from '@/models/User';

export type BranchManagerResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false };

/**
 * Checks the manager picked for a branch. `undefined` leaves the field alone, `null` or ''
 * clears it, and an id must belong to a user of this tenant: the branch list populates the
 * manager's name and email, so an id from another tenant would leak that user's details.
 */
export async function resolveBranchManager(
  managerId: unknown,
  tenantId: string | mongoose.Types.ObjectId
): Promise<BranchManagerResult> {
  if (managerId === undefined) return { ok: true, value: undefined };
  if (managerId === null || managerId === '') return { ok: true, value: null };
  if (typeof managerId !== 'string' || !mongoose.Types.ObjectId.isValid(managerId)) return { ok: false };
  const exists = await User.exists({ _id: managerId, tenantId });
  return exists ? { ok: true, value: managerId } : { ok: false };
}

/** A branch code from a request body: '' or null clears it, so the tenant-unique index never sees ''. */
export function normalizeBranchCode(code: unknown): string | null | undefined {
  if (code === undefined) return undefined;
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  return trimmed ? trimmed : null;
}
