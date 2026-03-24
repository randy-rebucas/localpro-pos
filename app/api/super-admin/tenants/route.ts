import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getDefaultTenantSettings } from '@/lib/currency';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const activeFilter = searchParams.get('active');

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }
    if (activeFilter === 'true') query.isActive = true;
    if (activeFilter === 'false') query.isActive = false;

    const tenants = await Tenant.find(query)
      .select('slug name settings.businessType settings.currency isActive createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: tenants });
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
    const { slug, name, currency, language, email, businessType } = body;

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

    const tenant = await Tenant.create({ slug, name, settings, isActive: true });

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.CREATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { slug, name },
      metadata: { createdBy: user.userId, role: 'super_admin' },
    });

    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
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
