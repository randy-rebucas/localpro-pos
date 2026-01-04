import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get all services across all stores
 * Query params: search, category, categoryId, storeSlug
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const storeSlug = searchParams.get('storeSlug') || '';

    // Build query - only services
    const query: Record<string, unknown> = {
      productType: 'service',
    };

    // Store filter
    if (storeSlug) {
      const tenant = await Tenant.findOne({ 
        slug: storeSlug, 
        isActive: true 
      }).select('_id').lean();
      
      if (tenant) {
        query.tenantId = tenant._id;
      }
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
      .populate('tenantId', 'name slug')
      .select('-branchStock -stock')
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    // Get all tenants for store info
    const tenantIds = [...new Set(services.map((s: { tenantId?: { _id?: { toString: () => string } } }) => s.tenantId?._id?.toString()).filter(Boolean))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name slug settings.companyName settings.logo')
      .lean();

    const tenantMap = new Map(tenants.map((t: { _id: { toString: () => string } }) => [t._id.toString(), t]));

    // Format response with store information
    const publicServices = services.map((service: unknown) => {
      const tenant = tenantMap.get(service.tenantId?._id?.toString() || '');
      return {
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
        store: tenant ? {
          _id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          companyName: tenant.settings?.companyName,
          logo: tenant.settings?.logo,
        } : null,
      };
    });

    return NextResponse.json({ 
      success: true, 
      data: publicServices,
      count: publicServices.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching all services:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch services' }, 
      { status: 500 }
    );
  }
}
