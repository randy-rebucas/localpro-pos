import { ReactNode } from 'react';
import { getTenantBySlug } from '@/lib/tenant';
import { notFound } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

export async function generateStaticParams() {
  // For static generation, you can return common tenants
  // In production, you might want to fetch from database
  return [
    { tenant: 'default' },
  ];
}

async function ensureDefaultTenant() {
  await connectDB();
  const existing = await Tenant.findOne({ slug: 'default' });
  
  if (!existing) {
    // Create default tenant if it doesn't exist
    await Tenant.create({
      slug: 'default',
      name: 'Default Store',
      settings: {
        currency: 'USD',
        timezone: 'UTC',
        language: 'en',
        primaryColor: '#2563eb',
      },
      isActive: true,
    });
  }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  
  // If it's the default tenant and doesn't exist, create it
  if (tenantSlug === 'default') {
    await ensureDefaultTenant();
  }
  
  // Verify tenant exists and is active
  const tenant = await getTenantBySlug(tenantSlug);
  
  if (!tenant) {
    notFound();
  }
  
  return <>{children}</>;
}

