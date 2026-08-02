import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function getUserByEmailForLogin(tenantId: string, email: string) {
  return prisma.user.findFirst({
    where: { tenantId, email: email.toLowerCase() },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserAuthState(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, isActive: true, tenantId: true },
  });
}

export async function updateLastLogin(id: string) {
  return prisma.user.update({ where: { id }, data: { lastLogin: new Date() } });
}

export async function updatePassword(id: string, newPlainPassword: string) {
  const bcrypt = await import('bcryptjs');
  const hashed = await bcrypt.hash(newPlainPassword, 10);
  return prisma.user.update({ where: { id }, data: { password: hashed } });
}

export async function updateUserProfile(
  id: string,
  data: { email?: string; name?: string; password?: string }
) {
  const updateData: { email?: string; name?: string; password?: string } = {};
  if (data.email !== undefined) updateData.email = data.email;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.password !== undefined) {
    const bcrypt = await import('bcryptjs');
    updateData.password = await bcrypt.hash(data.password, 10);
  }
  return prisma.user.update({ where: { id }, data: updateData });
}

export async function getUserByQrToken(qrToken: string) {
  return prisma.user.findUnique({ where: { qrToken } });
}

export async function getUserQrInfo(id: string, tenantId: string) {
  return prisma.user.findFirst({
    where: { id, tenantId },
    select: { id: true, qrToken: true, name: true, email: true },
  });
}

export async function setUserQrToken(id: string, qrToken: string) {
  return prisma.user.update({ where: { id }, data: { qrToken } });
}

export async function listTenantUsers(tenantId: string, isActiveFilter?: boolean) {
  const where: Prisma.UserWhereInput = { tenantId };
  if (isActiveFilter === true) where.isActive = { not: false };
  else if (isActiveFilter === false) where.isActive = false;
  return prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserByIdForTenant(id: string, tenantId: string) {
  return prisma.user.findFirst({ where: { id, tenantId } });
}

export async function countActiveUsers(tenantId: string) {
  return prisma.user.count({ where: { tenantId, isActive: true } });
}

export async function countActiveAdmins(tenantId: string, excludeId?: string) {
  return prisma.user.count({
    where: {
      tenantId,
      id: excludeId ? { not: excludeId } : undefined,
      isActive: { not: false },
      role: { in: ['owner', 'admin'] },
    },
  });
}

export async function updateTenantUser(
  id: string,
  tenantId: string,
  data: Partial<{
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    password: string;
  }>
) {
  const updateData: Prisma.UserUpdateManyMutationInput = {};
  if (data.email !== undefined) updateData.email = data.email;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.role !== undefined) updateData.role = data.role as never;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.password !== undefined) {
    const bcrypt = await import('bcryptjs');
    updateData.password = await bcrypt.hash(data.password, 10);
  }
  const result = await prisma.user.updateMany({ where: { id, tenantId }, data: updateData });
  if (result.count === 0) return null;
  return prisma.user.findFirst({ where: { id, tenantId } });
}

export async function deleteTenantUser(id: string, tenantId: string) {
  return prisma.user.deleteMany({ where: { id, tenantId } });
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: string;
  tenantId: string;
  isActive?: boolean;
}) {
  const bcrypt = await import('bcryptjs');
  const hashed = await bcrypt.hash(data.password, 10);
  return prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      password: hashed,
      name: data.name,
      role: data.role as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      tenantId: data.tenantId,
      isActive: data.isActive ?? true,
    },
  });
}
