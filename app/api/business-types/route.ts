import { NextRequest, NextResponse } from 'next/server';
import { BUSINESS_TYPE_CONFIGS, BusinessType } from '@/lib/business-types';

/**
 * GET /api/business-types
 * Get all available business types and their configurations
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as BusinessType | null;

    if (type && BUSINESS_TYPE_CONFIGS[type]) {
      // Return specific business type
      return NextResponse.json({
        success: true,
        data: BUSINESS_TYPE_CONFIGS[type],
      });
    }

    // Return all business types
    const businessTypes = Object.values(BUSINESS_TYPE_CONFIGS).map(config => ({
      type: config.type,
      name: config.name,
      description: config.description,
      defaultFeatures: config.defaultFeatures,
      productTypes: config.productTypes,
    }));

    return NextResponse.json({
      success: true,
      data: businessTypes,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch business types';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
