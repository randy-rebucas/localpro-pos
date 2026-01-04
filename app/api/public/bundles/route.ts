import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public product bundles list
 * Query params: tenantSlug (optional), search, categoryId
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const tenantSlug = searchParams.get('tenantSlug');
    const search = searchParams.get('search') || '';
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

    // Build query
    const query: Record<string, unknown> = {
      isActive: true,
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
    if (categoryId) {
      query.categoryId = categoryId;
    }

    const bundles = await ProductBundle.find(query)
      .populate('items.product', 'name price image')
      .select('name description price sku categoryId image items')
      .sort({ createdAt: -1 })
      .lean();

    // Format response - only public information
    const publicBundles = bundles.map((bundle: { _id: unknown; name: string; description?: string; price: number; sku?: string; categoryId?: unknown; image?: string; items?: Array<{ product: unknown; quantity: number }> }) => ({
      _id: bundle._id,
      name: bundle.name,
      description: bundle.description,
      price: bundle.price,
      sku: bundle.sku,
      categoryId: bundle.categoryId,
      image: bundle.image,
      items: bundle.items?.map((item: { product: unknown; quantity: number }) => ({
        product: item.product,
        quantity: item.quantity,
      })),
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicBundles,
      count: publicBundles.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching public bundles:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch bundles' }, 
      { status: 500 }
    );
  }
}
