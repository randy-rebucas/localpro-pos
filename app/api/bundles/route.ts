import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import '@/models/Category'; // register schema for populate
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { parseBundleInput } from '@/lib/bundle-input';
import { getTenantSettingsById } from '@/lib/tenant';
import { tenantDayEdge } from '@/lib/timezone';
import mongoose from 'mongoose';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');
    const categoryId = searchParams.get('categoryId');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const query: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
        { sku: { $regex: escapedSearch, $options: 'i' } },
      ];
    }
    if (isActive !== null && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    if (startDate || endDate) {
      // Picked days at the store, not UTC / the server's zone
      const timezone = (await getTenantSettingsById(tenantId))?.timezone;
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = tenantDayEdge(startDate, 'start', timezone);
      if (endDate) query.createdAt.$lte = tenantDayEdge(endDate, 'end', timezone);
    }
    if (categoryId && !mongoose.isValidObjectId(categoryId)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const bundles = await ProductBundle.find(query)
      .populate('items.productId', 'name price stock')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: bundles });
  } catch (_error: unknown) {
    logger.error('Error fetching bundles:', _error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bundles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { allowed } = checkRateLimit(`write:bundles:${tenantId}:${user.userId}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const parsed = await parseBundleInput(body ?? {}, tenantId, t, { partial: false });
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const bundle = await ProductBundle.create({
      ...parsed.value.set,
      tenantId,
      isActive: true,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'bundle',
      entityId: bundle._id.toString(),
      changes: parsed.value.set,
    });

    return NextResponse.json({ success: true, data: bundle }, { status: 201 });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if ((error as Record<string, unknown>).code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    logger.error('Error creating bundle:', error);
    return NextResponse.json({ success: false, error: 'Failed to create bundle' }, { status: 400 });
  }
}

