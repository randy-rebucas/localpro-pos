import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getDefaultTenantSettings } from '@/lib/currency';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const activeFilter = searchParams.get('active');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (activeFilter === 'true') where.isActive = true;
    if (activeFilter === 'false') where.isActive = false;

    const total = await prisma.tenant.count({ where });
    const pages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const tenants = await prisma.tenant.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        onboardingStatus: true,
        notes: true,
        createdAt: true,
        settings: {
          select: {
            businessType: true,
            currency: true,
            language: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: tenants,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { slug, name, currency, language, email, businessType, ownerEmail, ownerName, trialDays = 14 } = body;

    if (!slug || !name) {
      return NextResponse.json(
        { success: false, error: 'Slug and name are required' },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { success: false, error: 'Slug may only contain lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A tenant with this slug already exists' },
        { status: 400 }
      );
    }

    let settings = getDefaultTenantSettings();
    if (currency) settings = { ...settings, currency };
    if (language) settings = { ...settings, language };
    if (email) settings = { ...settings, email };
    if (businessType) settings = applyBusinessTypeDefaults(settings, businessType);

    // Tenant + trial subscription + billing event + owner user must all land
    // together or not at all — a partial provision (e.g. tenant created but
    // owner account creation fails) leaves an orphaned tenant nobody can log
    // into, or a subscription with no billing event backing it.
    const starterPlan = await prisma.subscriptionPlan.findFirst({ where: { tier: 'starter', isActive: true } });
    const existingUser = ownerEmail ? await prisma.user.findUnique({ where: { email: ownerEmail.toLowerCase() } }) : null;
    const tempPassword = (ownerEmail && !existingUser) ? crypto.randomBytes(8).toString('hex') : null;

    const { tenant, subscription, ownerUser } = await prisma.$transaction(async (tx) => {
      const tenantId = randomUUID();
      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          slug,
          name,
          isActive: true,
          onboardingStatus: 'in_progress',
          createdById: user.userId,
          settings: { create: settings as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
        },
      });

      let subscription = null;
      if (starterPlan) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);
        subscription = await tx.subscription.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            planId: starterPlan.id,
            status: 'trial',
            isTrial: true,
            trialEndDate: trialEnd,
            nextBillingDate: trialEnd,
            billingCycle: 'monthly',
          },
        });
        await tx.billingEvent.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            subscriptionId: subscription.id,
            type: 'trial_started',
            amount: 0,
            currency: currency || 'PHP',
            description: `Trial started for ${trialDays} days on ${starterPlan.name} plan`,
            recordedById: user.userId,
          },
        });
      }

      let ownerUser = null;
      if (ownerEmail && tempPassword) {
        ownerUser = await tx.user.create({
          data: {
            id: randomUUID(),
            email: ownerEmail.toLowerCase(),
            password: tempPassword,
            name: ownerName || name,
            role: 'owner',
            tenantId: tenant.id,
            isActive: true,
          },
        });
      }

      return { tenant, subscription, ownerUser };
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes: { slug, name },
      metadata: { createdBy: user.userId, role: 'super_admin' },
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await prisma.superAdminAction.create({
      data: {
        id: randomUUID(),
        adminUserId: user.userId,
        action: 'tenant.create',
        targetType: 'Tenant',
        targetId: tenant.id,
        description: `Created tenant "${name}" (${slug})`,
        changes: { slug, name, ownerEmail: ownerEmail || null },
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    return NextResponse.json({
      success: true,
      data: tenant,
      provisioned: {
        subscription: subscription ? { id: subscription.id, planTier: 'starter', trialDays } : null,
        ownerUser: ownerUser ? { id: ownerUser.id, email: ownerEmail, tempPassword } : null,
      },
    }, { status: 201 });
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
