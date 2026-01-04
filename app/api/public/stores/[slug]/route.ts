import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public store/tenant information by slug
 * No authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const { slug } = await params;

    const tenant = await Tenant.findOne({ 
      slug,
      isActive: true 
    })
      .select('name slug subdomain domain settings createdAt')
      .lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    // Format response - only public information
    const publicStore = {
      _id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      domain: tenant.domain,
      companyName: tenant.settings?.companyName || tenant.name,
      logo: tenant.settings?.logo,
      primaryColor: tenant.settings?.primaryColor,
      secondaryColor: tenant.settings?.secondaryColor,
      accentColor: tenant.settings?.accentColor,
      address: tenant.settings?.address,
      phone: tenant.settings?.phone,
      email: tenant.settings?.email,
      website: tenant.settings?.website,
      businessType: tenant.settings?.businessType,
      currency: tenant.settings?.currency,
      currencySymbol: tenant.settings?.currencySymbol,
      taxEnabled: tenant.settings?.taxEnabled,
      taxRate: tenant.settings?.taxRate,
      taxLabel: tenant.settings?.taxLabel,
      // Feature flags (public info)
      enableInventory: tenant.settings?.enableInventory,
      enableCategories: tenant.settings?.enableCategories,
      enableDiscounts: tenant.settings?.enableDiscounts,
      enableBookingScheduling: tenant.settings?.enableBookingScheduling,
      createdAt: tenant.createdAt,
    };

    return NextResponse.json({ 
      success: true, 
      data: publicStore 
    });
  } catch (error: unknown) {
    console.error('Error fetching public store:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch store' }, 
      { status: 500 }
    );
  }
}
