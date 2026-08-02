import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getDefaultTenantSettings } from '@/lib/currency';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { createUser } from '@/lib/data/users';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const activeFilter = searchParams.get('active');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where: Prisma.TenantWhereInput = {};
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
        settings: true,
        isActive: true,
        onboardingStatus: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const data = tenants.map(({ id, ...rest }) => ({ _id: id, ...rest }));

    return NextResponse.json({
      success: true,
      data,
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

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name,
        settings: settings as unknown as Prisma.InputJsonValue,
        isActive: true,
        onboardingStatus: 'in_progress',
        createdBy: user.userId,
      },
    });

    // Auto-provision: find starter plan and create a trial subscription
    const starterPlan = await prisma.subscriptionPlan.findFirst({ where: { tier: 'starter', isActive: true } });
    let subscription = null;
    if (starterPlan) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + trialDays);
      subscription = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: starterPlan.id,
          status: 'trial',
          isTrial: true,
          trialEndDate: trialEnd,
          nextBillingDate: trialEnd,
          billingCycle: 'monthly',
        },
      });
      await prisma.billingEvent.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          type: 'trial_started',
          amount: 0,
          currency: currency || 'PHP',
          description: `Trial started for ${trialDays} days on ${starterPlan.name} plan`,
          recordedBy: user.userId,
        },
      });
    }

    // Auto-provision: create owner user if ownerEmail provided
    let ownerUser = null;
    let tempPassword = null;
    if (ownerEmail) {
      const existingUser = await prisma.user.findFirst({ where: { email: ownerEmail.toLowerCase() } });
      if (!existingUser) {
        tempPassword = crypto.randomBytes(8).toString('hex');
        ownerUser = await createUser({
          email: ownerEmail.toLowerCase(),
          password: tempPassword,
          name: ownerName || name,
          role: 'owner',
          tenantId: tenant.id,
          isActive: true,
        });
      }
    }

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
      data: { ...tenant, _id: tenant.id },
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
