import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import Tenant from '@/models/Tenant';

/**
 * GET - Get categories for a specific store
 * Query params: search
 * No authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    // Get tenant by slug
    const tenant = await Tenant.findOne({ 
      slug,
      isActive: true 
    }).select('_id name').lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    // Build query
    const query: Record<string, unknown> = { tenantId: tenant._id,
    };

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
      count: categories.length,
      store: {
        _id: tenant._id,
        name: tenant.name,
        slug,
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching store categories:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch categories' }, 
      { status: 500 }
    );
  }
}
