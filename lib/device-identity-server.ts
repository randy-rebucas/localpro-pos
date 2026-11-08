import mongoose from 'mongoose';
import Branch from '@/models/Branch';

/** Whether `branchId` is a branch of this tenant, so a device can only be filed under its own store's branches. */
export async function tenantBranchExists(branchId: unknown, tenantId: string | mongoose.Types.ObjectId): Promise<boolean> {
  if (typeof branchId !== 'string' || !mongoose.Types.ObjectId.isValid(branchId)) return false;
  return !!(await Branch.exists({ _id: branchId, tenantId }));
}
