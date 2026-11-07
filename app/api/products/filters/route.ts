import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import { requireTenantAccess } from '@/lib/api-tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

/**
 * Category names for the Products filter. Products can carry free-text categories
 * that aren't in the Category list, so the options come from both places.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:products-filters:${ip}`, 60, 60_000);

    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    let tenantId: string;
    try {
      tenantId = (await requireTenantAccess(request)).tenantId;
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : '';
      return NextResponse.json(
        { success: false, error: msg.includes('Forbidden') ? t('validation.forbidden', 'Forbidden') : t('validation.unauthorized', 'Unauthorized') },
        { status: msg.includes('Forbidden') ? 403 : 401 }
      );
    }

    const [named, typed] = await Promise.all([
      Category.find({ tenantId, isActive: { $ne: false } }).select('name').lean(),
      Product.distinct('category', { tenantId }),
    ]);

    const categories = [...new Set([...named.map((category) => category.name), ...typed])]
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ success: true, data: { categories } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch product filters');
  }
}
