import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public stores/tenants list
 * Query params: search, isActive
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive') !== 'false'; // Default to true

    // Build query
    const query: Record<string, unknown> = {};
    
    if (isActive) {
      query.isActive = true;
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { 'settings.companyName': { $regex: search, $options: 'i' } },
      ];
    }

    const tenants = await Tenant.find(query)
      .select('name slug subdomain domain settings.isActive settings.companyName settings.logo settings.primaryColor settings.address settings.phone settings.email settings.website settings.businessType createdAt')
      .sort({ name: 1 })
      .lean();

    // Format response - only public information
    const publicStores = tenants.map((tenant: { _id: unknown; name: string; slug: string; settings?: { companyName?: string; logo?: string } }) => ({
      _id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      domain: tenant.domain,
      companyName: tenant.settings?.companyName || tenant.name,
      logo: tenant.settings?.logo,
      primaryColor: tenant.settings?.primaryColor,
      address: tenant.settings?.address,
      phone: tenant.settings?.phone,
      email: tenant.settings?.email,
      website: tenant.settings?.website,
      businessType: tenant.settings?.businessType,
      createdAt: tenant.createdAt,
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicStores,
      count: publicStores.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching public stores:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch stores' }, 
      { status: 500 }
    );
  }
}
