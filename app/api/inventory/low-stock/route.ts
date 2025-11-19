import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getLowStockProducts } from '@/lib/stock';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import Tenant from '@/models/Tenant';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('branchId') || undefined;
    const threshold = searchParams.get('threshold') ? parseInt(searchParams.get('threshold')!) : undefined;

    // Get tenant settings for default threshold
    const tenant = await Tenant.findById(tenantId);
    const defaultThreshold = tenant?.settings?.lowStockThreshold || 10;
    const finalThreshold = threshold || defaultThreshold;

    const lowStockProducts = await getLowStockProducts(tenantId, branchId, finalThreshold);

    return NextResponse.json({
      success: true,
      data: lowStockProducts,
      threshold: finalThreshold,
      count: lowStockProducts.length,
    });
  } catch (error: any) {
    console.error('Error fetching low stock products:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

