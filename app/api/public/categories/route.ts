import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public categories list
 * Query params: tenantSlug (optional), search
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const tenantSlug = searchParams.get('tenantSlug');
    const search = searchParams.get('search') || '';

    let tenantId = null;

    // Get tenant ID if tenantSlug provided
    if (tenantSlug) {
      const tenant = await Tenant.findOne({ 
        slug: tenantSlug, 
        isActive: true 
      }).select('_id').lean();
      
      if (tenant) {
        tenantId = tenant._id;
      }
    }

    // Build query
    const query: Record<string, unknown> = {};
    
    if (tenantId) {
      query.tenantId = tenantId;
    }

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const categories = await Category.find(query)
      .select('name description image order')
      .sort({ order: 1, name: 1 })
      .lean();

    return NextResponse.json({ 
      success: true, 
      data: categories,
      count: categories.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching public categories:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch categories' }, 
      { status: 500 }
    );
  }
}
