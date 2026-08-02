import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function listBranches(tenantId: string, isActive?: boolean) {
  const where: Prisma.BranchWhereInput = { tenantId };
  if (isActive !== undefined) where.isActive = isActive;
  return prisma.branch.findMany({
    where,
    include: { manager: { select: { id: true, name: true, email: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getBranchById(id: string, tenantId: string) {
  return prisma.branch.findFirst({
    where: { id, tenantId },
    include: { manager: { select: { id: true, name: true, email: true } } },
  });
}

export async function countActiveBranches(tenantId: string) {
  return prisma.branch.count({ where: { tenantId, isActive: true } });
}

export async function createBranch(data: {
  tenantId: string;
  name: string;
  code?: string | null;
  address?: Prisma.InputJsonValue;
  phone?: string | null;
  email?: string | null;
  managerId?: string | null;
}) {
  return prisma.branch.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      code: data.code || undefined,
      address: data.address,
      phone: data.phone || undefined,
      email: data.email || undefined,
      managerId: data.managerId || undefined,
      isActive: true,
    },
  });
}

export async function updateBranch(
  id: string,
  tenantId: string,
  data: Partial<{
    name: string;
    code: string | null;
    address: Prisma.InputJsonValue | null;
    phone: string | null;
    email: string | null;
    managerId: string | null;
    isActive: boolean;
  }>
) {
  const result = await prisma.branch.updateMany({ where: { id, tenantId }, data: data as Prisma.BranchUncheckedUpdateManyInput });
  if (result.count === 0) return null;
  return prisma.branch.findFirst({ where: { id, tenantId } });
}
