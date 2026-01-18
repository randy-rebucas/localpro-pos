import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateCategory } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const categories = await Category.find({ tenantId })
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: categories });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch categories';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      const authErrorMessage = authError instanceof Error ? authError.message : 'Authentication error';
      if (authErrorMessage.includes('Unauthorized') || authErrorMessage.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authErrorMessage },
          { status: authErrorMessage.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }

    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);
    const { data, errors } = validateAndSanitize(body, validateCategory, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const category = await Category.create({
      ...data,
      tenantId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'category',
      entityId: category._id.toString(),
      changes: data,
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Category with this name already exists' },
        { status: 400 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to create category';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
  }
}

