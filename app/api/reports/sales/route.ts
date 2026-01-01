import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getSalesReport } from '@/lib/analytics';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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
    const period = (searchParams.get('period') || 'daily') as 'daily' | 'weekly' | 'monthly';
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

    const report = await getSalesReport(tenantId, period, startDate, endDate);

    return NextResponse.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Error fetching sales report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

