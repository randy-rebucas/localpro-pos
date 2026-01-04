import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get services for a specific store
 * Query params: search, category, categoryId
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
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';

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

    // Build query - only services
    const query: Record<string, unknown> = { tenantId: tenant._id,
      productType: 'service',
    };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }

    const services = await Product.find(query)
      .populate('categoryId', 'name')
      .select('-branchStock -stock')
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    // Format response
    const publicServices = services.map((service: { _id: unknown; name: string; description?: string; price: number; serviceDuration?: number; image?: string; categoryId?: unknown }) => ({
      _id: service._id,
      name: service.name,
      description: service.description,
      price: service.price,
      sku: service.sku,
      category: service.category,
      categoryId: service.categoryId,
      image: service.image,
      serviceType: service.serviceType,
      serviceDuration: service.serviceDuration,
      estimatedDuration: service.estimatedDuration,
      staffRequired: service.staffRequired,
      equipmentRequired: service.equipmentRequired,
      weightBased: service.weightBased,
      pickupDelivery: service.pickupDelivery,
      modifiers: service.modifiers,
      allergens: service.allergens,
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicServices,
      count: publicServices.length,
      store: {
        _id: tenant._id,
        name: tenant.name,
        slug,
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching store services:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch services' }, 
      { status: 500 }
    );
  }
}
