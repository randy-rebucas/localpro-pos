import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// TableStatus enum: 'check-requested' (API/original) maps to Prisma's
// 'check_requested' client value via @map.
export function toPrismaTableStatus(status: string): 'open' | 'occupied' | 'check_requested' {
  return status === 'check-requested' ? 'check_requested' : (status as 'open' | 'occupied');
}

export function fromPrismaTableStatus(status: string): string {
  return status === 'check_requested' ? 'check-requested' : status;
}

export async function listTables(
  tenantId: string,
  filters: { isActive?: boolean; branchId?: string; status?: string }
) {
  const where: Prisma.TableWhereInput = { tenantId };
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.status) where.status = toPrismaTableStatus(filters.status);
  return prisma.table.findMany({ where, orderBy: { name: 'asc' } });
}

export async function getTableById(id: string, tenantId: string) {
  return prisma.table.findFirst({ where: { id, tenantId } });
}

export async function createTable(data: {
  tenantId: string;
  name: string;
  capacity?: number | null;
  branchId?: string | null;
}) {
  return prisma.table.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      capacity: data.capacity ?? undefined,
      branchId: data.branchId || undefined,
      status: 'open',
      isActive: true,
    },
  });
}

export async function updateTable(
  id: string,
  tenantId: string,
  data: Partial<{
    name: string;
    capacity: number | null;
    status: 'open' | 'occupied' | 'check_requested';
    isActive: boolean;
    currentOrderId: string | null;
  }>
) {
  const result = await prisma.table.updateMany({ where: { id, tenantId }, data });
  if (result.count === 0) return null;
  return prisma.table.findFirst({ where: { id, tenantId } });
}
