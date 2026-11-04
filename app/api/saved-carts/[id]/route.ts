import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const savedCart = await getRepos().savedCarts.findForUser(tenantId, user.userId, id);

    if (!savedCart) {
      return NextResponse.json({ success: false, error: t('validation.savedCartNotFound', 'Saved cart not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: savedCart });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching saved cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const deactivated = await getRepos().savedCarts.deactivate(tenantId, user.userId, id);

    if (!deactivated) {
      return NextResponse.json({ success: false, error: t('validation.savedCartNotFound', 'Saved cart not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: t('validation.savedCartDeleted', 'Saved cart deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting saved cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

