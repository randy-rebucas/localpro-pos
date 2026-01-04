import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public service details by ID
 * Query params: tenantSlug (optional)
 * No authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const tenantSlug = searchParams.get('tenantSlug');

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

    // Build query - must be a service
    const query: Record<string, unknown> = { 
      _id: id,
      productType: 'service',
    };
    
    if (tenantId) {
      query.tenantId = tenantId;
    }

    const service = await Product.findOne(query)
      .populate('categoryId', 'name description image')
      .select('-branchStock -stock') // Services don't have stock
      .lean();

    if (!service) {
      return NextResponse.json(
        { success: false, error: 'Service not found' },
        { status: 404 }
      );
    }

    // Format response - service-specific fields
    const publicService = {
      _id: service._id,
      name: service.name,
      description: service.description,
      price: service.price,
      sku: service.sku,
      category: service.category,
      categoryId: service.categoryId,
      image: service.image,
      // Service-specific fields
      serviceType: service.serviceType,
      serviceDuration: service.serviceDuration,
      estimatedDuration: service.estimatedDuration,
      staffRequired: service.staffRequired,
      equipmentRequired: service.equipmentRequired,
      // Laundry-specific
      weightBased: service.weightBased,
      pickupDelivery: service.pickupDelivery,
      // Restaurant-specific
      modifiers: service.modifiers,
      allergens: service.allergens,
      nutritionInfo: service.nutritionInfo,
      pinned: service.pinned,
    };

    return NextResponse.json({ 
      success: true, 
      data: publicService 
    });
  } catch (error: unknown) {
    console.error('Error fetching public service:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch service' }, 
      { status: 500 }
    );
  }
}
