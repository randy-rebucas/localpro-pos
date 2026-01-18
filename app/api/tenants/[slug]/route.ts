import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    const tenant = await Tenant.findOne({ slug }).lean();
    
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    // Expose subscription info only once
      const { subscription, ...rest } = tenant;
    return NextResponse.json({
      success: true,
      data: {
        ...rest,
          subscription,
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    const body = await request.json();
    const { 
      name, 
      domain, 
      subdomain, 
      isActive, 
      settings,
      subscriptionPlan, 
      subscriptionPrice, 
      subscriptionStatus, 
      subscriptionTrialEndsAt, 
      subscriptionEndsAt
    } = body;

    const oldTenant = await Tenant.findOne({ slug }).lean();
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
          { status: 400 }
      subscription 
    if (domain !== undefined) {
      updateData.domain = domain.trim() || null;
    }
    
    if (subdomain !== undefined) {
      updateData.subdomain = subdomain.trim().toLowerCase() || null;
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    
    if (settings !== undefined) {
          // Subscription plan logic
          if (subscriptionPlan !== undefined) {
            // Only allow valid plans
            const validPlans = ['starter', 'pro', 'business', 'enterprise'];
            if (!validPlans.includes(subscriptionPlan)) {
              return NextResponse.json({ success: false, error: 'Invalid subscription plan' }, { status: 400 });
            }
            updateData.subscriptionPlan = subscriptionPlan;
          }
          if (subscriptionPrice !== undefined) {
            updateData.subscriptionPrice = subscriptionPrice;
          }
          if (subscriptionStatus !== undefined) {
            // Only allow valid statuses
            const validStatuses = ['trial', 'active', 'expired', 'cancelled'];
            if (!validStatuses.includes(subscriptionStatus)) {
              return NextResponse.json({ success: false, error: 'Invalid subscription status' }, { status: 400 });
            }
            updateData.subscriptionStatus = subscriptionStatus;
          }
          if (subscriptionTrialEndsAt !== undefined) {
            updateData.subscriptionTrialEndsAt = subscriptionTrialEndsAt;
          }
          if (subscriptionEndsAt !== undefined) {
            updateData.subscriptionEndsAt = subscriptionEndsAt;
          }
      // Check if business type is being changed
      const currentBusinessType = oldTenant.settings?.businessType;
      const newBusinessType = settings.businessType;
      
      // Merge settings first
      let mergedSettings = { ...oldTenant.settings, ...settings };
      
      // Apply business type defaults if business type is being set or changed
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        mergedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
      }
      
      updateData.settings = mergedSettings;
    }

    const tenant = await Tenant.findOneAndUpdate(
      { slug },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, unknown> = {};
    Object.keys(updateData).forEach(key => {
      if (key !== 'settings' && oldTenant[key as keyof typeof oldTenant] !== updateData[key]) {
        changes[key] = {
          old: oldTenant[key as keyof typeof oldTenant],
          new: updateData[key],
        };
      }
    });
    if (settings) {
      changes.settings = { updated: true };
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes,
    });
    
    // Expose subscription info only once in response
    const { subscriptionPlan, subscriptionPrice, subscriptionStatus, subscriptionTrialEndsAt, subscriptionEndsAt, ...rest } = tenant.toObject();
    return NextResponse.json({
      success: true,
      data: {
        ...rest,
        subscriptionPlan,
        subscriptionPrice,
        subscriptionStatus,
        subscriptionTrialEndsAt,
        subscriptionEndsAt,
      },
    const { subscription: updatedSubscription, ...rest } = tenant.toObject();
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
        subscription: updatedSubscription,
    }
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    await Tenant.findOneAndUpdate({ slug }, { isActive: false });

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.DELETE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { slug: tenant.slug, name: tenant.name },
    });
    
    return NextResponse.json({ success: true, data: {} });
  } catch (error: unknown) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

