import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public active discounts list
 * Query params: tenantSlug (optional)
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
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

    // Build query - only active discounts that are currently valid
    const query: Record<string, unknown> = {
      isActive: true,
    };
    
    if (tenantId) {
      query.tenantId = tenantId;
    }

    const now = new Date();
    query.validFrom = { $lte: now };
    query.$and = [
      {
        $or: [
          { validUntil: { $gte: now } },
          { validUntil: null },
        ],
      },
      {
        $or: [
          { usageLimit: null },
          { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
        ],
      },
    ];

    const discounts = await Discount.find(query)
      .select('code name description type value maxDiscountAmount minPurchaseAmount validFrom validUntil')
      .sort({ createdAt: -1 })
      .lean();

    // Format response - only public information
    const publicDiscounts = discounts.map((discount: { _id: unknown; code: string; name?: string; description?: string; type: string; value: number; minPurchaseAmount?: number; validFrom?: Date; validUntil?: Date }) => ({
      _id: discount._id,
      code: discount.code,
      name: discount.name,
      description: discount.description,
      type: discount.type, // 'percentage' or 'fixed'
      value: discount.type === 'percentage' ? discount.value : undefined, // Don't expose fixed amount
      maxDiscountAmount: discount.maxDiscountAmount,
      minPurchaseAmount: discount.minPurchaseAmount,
      validFrom: discount.validFrom,
      validUntil: discount.validUntil,
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicDiscounts,
      count: publicDiscounts.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching public discounts:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch discounts' }, 
      { status: 500 }
    );
  }
}
