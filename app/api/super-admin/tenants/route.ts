import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import User from '@/models/User';
import BillingEvent from '@/models/BillingEvent';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getDefaultTenantSettings } from '@/lib/currency';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const activeFilter = searchParams.get('active');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }
    if (activeFilter === 'true') query.isActive = true;
    if (activeFilter === 'false') query.isActive = false;

    const total = await Tenant.countDocuments(query);
    const pages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const tenants = await Tenant.find(query)
      .select('slug name settings.businessType settings.currency settings.language settings.email isActive onboardingStatus notes createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

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
    await connectDB();
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

    const existing = await Tenant.findOne({ slug }).lean();
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
    const starterPlan = await SubscriptionPlan.findOne({ tier: 'starter', isActive: true }).lean();
    const existingUser = ownerEmail ? await User.findOne({ email: ownerEmail.toLowerCase() }).lean() : null;
    const tempPassword = (ownerEmail && !existingUser) ? crypto.randomBytes(8).toString('hex') : null;

    const session = await mongoose.startSession();
    let tenant, subscription = null, ownerUser = null;
    try {
      session.startTransaction();

      [tenant] = await Tenant.create([{
        slug,
        name,
        settings,
        isActive: true,
        onboardingStatus: 'in_progress',
        createdBy: user.userId,
      }], { session });

      if (starterPlan) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);
        [subscription] = await Subscription.create([{
          tenantId: tenant._id,
          planId: starterPlan._id,
          status: 'trial',
          isTrial: true,
          trialEndDate: trialEnd,
          nextBillingDate: trialEnd,
          billingCycle: 'monthly',
        }], { session });
        await BillingEvent.create([{
          tenantId: tenant._id,
          subscriptionId: subscription._id,
          type: 'trial_started',
          amount: 0,
          currency: currency || 'PHP',
          description: `Trial started for ${trialDays} days on ${(starterPlan as { name: string }).name} plan`,
          recordedBy: user.userId,
        }], { session });
      }

      if (ownerEmail && tempPassword) {
        [ownerUser] = await User.create([{
          email: ownerEmail.toLowerCase(),
          password: tempPassword,
          name: ownerName || name,
          role: 'owner',
          tenantId: tenant._id,
          isActive: true,
        }], { session });
      }

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { slug, name },
      metadata: { createdBy: user.userId, role: 'super_admin' },
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await SuperAdminAction.create({
      adminUserId: user.userId,
      action: 'tenant.create',
      targetType: 'Tenant',
      targetId: tenant._id.toString(),
      description: `Created tenant "${name}" (${slug})`,
      changes: { slug, name, ownerEmail: ownerEmail || null },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({
      success: true,
      data: tenant,
      provisioned: {
        subscription: subscription ? { id: subscription._id, planTier: 'starter', trialDays } : null,
        ownerUser: ownerUser ? { id: ownerUser._id, email: ownerEmail, tempPassword } : null,
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
