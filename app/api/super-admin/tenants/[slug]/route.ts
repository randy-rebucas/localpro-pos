import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireRole(request, ['super_admin']);
    const { slug } = await params;

    const tenant = await prisma.tenant.findUnique({ where: { slug }, include: { settings: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: tenant });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireRole(request, ['super_admin']);
    const { slug } = await params;

    const oldTenant = await prisma.tenant.findUnique({ where: { slug }, include: { settings: true } });
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings, onboardingStatus, notes } = body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (domain !== undefined) updateData.domain = domain.trim() || null;
    if (subdomain !== undefined) updateData.subdomain = subdomain.trim().toLowerCase() || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (onboardingStatus !== undefined) updateData.onboardingStatus = onboardingStatus;
    if (notes !== undefined) updateData.notes = notes;

    let mergedSettings: Record<string, unknown> | undefined;
    if (settings !== undefined) {
      const currentBusinessType = oldTenant.settings?.businessType;
      const newBusinessType = settings.businessType;
      mergedSettings = { ...(oldTenant.settings || {}), ...settings };
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        mergedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
      }
      // tenantId is the settings table's own PK/FK, not an updatable field
      delete (mergedSettings as Record<string, unknown>).tenantId;
    }

    let tenant;
    try {
      tenant = await prisma.tenant.update({
        where: { slug },
        data: {
          ...updateData,
          ...(mergedSettings !== undefined
            ? {
                settings: {
                  upsert: {
                    create: { ...(mergedSettings as any), tenantId: undefined }, // eslint-disable-line @typescript-eslint/no-explicit-any
                    update: mergedSettings as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                  },
                },
              }
            : {}),
        },
        include: { settings: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      throw e;
    }

    const changes: Record<string, unknown> = {};
    Object.keys(updateData).forEach(key => {
      changes[key] = { old: (oldTenant as Record<string, unknown>)[key], new: updateData[key] };
    });
    if (settings) changes.settings = { updated: true };

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes,
      metadata: { updatedBy: user.userId, role: 'super_admin' },
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.message === 'Unauthorized' ? 401 : 403 }
        );
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Domain or subdomain already exists' }, { status: 400 });
    }
    return handleApiError(error);
  }
}
