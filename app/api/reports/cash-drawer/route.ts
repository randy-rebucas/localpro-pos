import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getCashDrawerReports } from '@/lib/analytics';
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
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date();

    const reports = await getCashDrawerReports(tenantId, startDate, endDate);

    return NextResponse.json({ success: true, data: reports });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching cash drawer reports:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

