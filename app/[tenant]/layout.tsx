import { ReactNode } from 'react';
import { getTenantBySlug } from '@/lib/tenant';
import { notFound } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { cacheDel, CacheKeys } from '@/lib/cache';
import { logger } from '@/lib/logger';

// Tenant pages are ISR-cached. Without a revalidate window a notFound() rendered
// while a tenant was inactive (e.g. suspended for non-payment) stays cached on
// the CDN forever, so the store keeps 404ing after it is reactivated.
export const revalidate = 60;

export async function generateStaticParams() {
  // For static generation, you can return common tenants
  // In production, you might want to fetch from database
  return [
    { tenant: 'default' },
  ];
}

async function ensureDefaultTenant() {
  await connectDB();
  try {
    // Create default tenant if it doesn't exist
    await Tenant.create({
      slug: 'default',
      name: 'Default Store',
      settings: {
        currency: 'USD',
        timezone: 'Asia/Manila',
        language: 'en',
        primaryColor: '#35979c',
      },
      isActive: true,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    // If duplicate key error (11000), the tenant already exists (possibly inactive)
    // or another parallel process already created it
    // This can happen during build/prerendering when multiple pages are generated in parallel
    // It's safe to ignore this error and continue
    if (error.code !== 11000) {
      // Re-throw if it's a different error
      throw error;
    }
  }
  // The lookup that triggered this cached "not found" — drop it so the re-lookup
  // sees a tenant created here or by another process
  cacheDel(CacheKeys.tenantBySlug('default'));
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  // Verify tenant exists and is active (cached lookup)
  let tenant = await getTenantBySlug(tenantSlug);

  // If it's the default tenant and doesn't exist, create it. Best-effort: when the
  // database is unreachable (e.g. prerendering during `next build`) fall through
  // to notFound() like the lookup itself does, instead of failing the render.
  if (!tenant && tenantSlug === 'default') {
    try {
      await ensureDefaultTenant();
      tenant = await getTenantBySlug(tenantSlug);
    } catch (error) {
      logger.error('Could not ensure default tenant:', error);
    }
  }

  if (!tenant) {
    notFound();
  }

  // NOTE: an earlier version of this layout also compared the signed-in user's
  // tenant (and the request host) with this tenant and called redirect(). That
  // call sat inside a try/catch that swallowed Next's redirect error, so it never
  // ran. Enforcing it as written would block legitimate flows (bare domain →
  // /default, signing in to a second tenant on the shared cookie, path routing
  // for tenants with a domain set), so it was removed rather than switched on. Tenant data access is enforced
  // server-side by the API routes (requireTenantAccess / tenantId scoping).

  return <>{children}</>;
}
