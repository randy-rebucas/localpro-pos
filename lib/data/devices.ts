import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function listDevices(tenantId: string, isActive?: boolean) {
  const where: Prisma.DeviceWhereInput = { tenantId };
  if (isActive !== undefined) where.isActive = isActive;
  return prisma.device.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      registeredByUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { terminalId: 'asc' },
  });
}

export async function getDeviceById(id: string, tenantId: string) {
  return prisma.device.findFirst({ where: { id, tenantId } });
}

export async function createDevice(data: {
  tenantId: string;
  branchId?: string | null;
  label: string;
  serialNumber: string;
  terminalId: string;
  ptuNumber?: string | null;
  ptuStatus?: 'pending' | 'approved';
  registeredBy: string;
}) {
  return prisma.device.create({
    data: {
      tenantId: data.tenantId,
      branchId: data.branchId || undefined,
      label: data.label,
      serialNumber: data.serialNumber,
      terminalId: data.terminalId,
      ptuNumber: data.ptuNumber || undefined,
      ptuStatus: data.ptuStatus || 'pending',
      isActive: true,
      registeredBy: data.registeredBy,
    },
  });
}

export async function updateDevice(
  id: string,
  tenantId: string,
  data: Partial<{
    label: string;
    serialNumber: string;
    terminalId: string;
    branchId: string | null;
    ptuNumber: string | null;
    ptuStatus: 'pending' | 'approved';
    isActive: boolean;
  }>
) {
  const result = await prisma.device.updateMany({
    where: { id, tenantId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.device.findFirst({ where: { id, tenantId } });
}
