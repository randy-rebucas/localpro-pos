import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public services list (products with productType='service')
 * Query params: tenantSlug (optional), search, category, categoryId
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const tenantSlug = searchParams.get('tenantSlug');
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';

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

    // Build query - only services
    const query: Record<string, unknown> = {
      productType: 'service',
    };
    
    if (tenantId) {
      query.tenantId = tenantId;
    }

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
      .select('-branchStock -stock') // Services don't have stock
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    // Format response - service-specific fields
    const publicServices = services.map((service: { _id: unknown; name: string; description?: string; price: number; serviceDuration?: number; image?: string; categoryId?: unknown }) => ({
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
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicServices,
      count: publicServices.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching public services:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch services' }, 
      { status: 500 }
    );
  }
}
