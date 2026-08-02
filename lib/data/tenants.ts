import prisma from '@/lib/prisma';

export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findFirst({ where: { slug, isActive: true } });
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({ where: { id } });
}

// Same as getTenantBySlug but does NOT filter on isActive — used by tenant
// admin CRUD routes (GET/PUT/DELETE tenant, settings sub-routes) that need
// to find/reactivate a soft-deleted (isActive: false) tenant.
export async function getTenantBySlugAny(slug: string) {
  return prisma.tenant.findFirst({ where: { slug } });
}
