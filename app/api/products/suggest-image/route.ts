import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { generateImageDescription } from '@/lib/claude';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/products/suggest-image
 * Generate an AI product image description using Claude
 * 
 * Request body:
 * {
 *   "productName": "string (required)",
 *   "category": "string (optional)"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "description": "Professional image description..."
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit image suggestions (reasonable limit)
    const rateLimitResult = await checkRateLimit('suggest-image', 20, 3600000); // 20 per hour
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many image suggestions. Please try again later.',
        },
        { status: 429 }
      );
    }

    // Authenticate user
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;

    // Parse request body
    const body = await request.json();
    const { productName, category } = body as { productName?: string; category?: string };

    // Validate input
    if (!productName || typeof productName !== 'string' || productName.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Product name is required and must be a non-empty string',
        },
        { status: 400 }
      );
    }

    if (productName.length > 200) {
      return NextResponse.json(
        {
          success: false,
          error: 'Product name is too long (max 200 characters)',
        },
        { status: 400 }
      );
    }

    logger.info(`[Claude] Generating image description for product: ${productName}`);

    // Generate description with Claude
    const description = await generateImageDescription(productName, category);

    logger.info(`[Claude] Image description generated successfully for product: ${productName}`);

    return NextResponse.json(
      {
        success: true,
        data: {
          description,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate image description';

    logger.error(`[Claude] Image description generation failed: ${errorMessage}`);

    // Check for specific Claude errors
    if (errorMessage.includes('401') || errorMessage.includes('401')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Claude API key is not configured or invalid. Please contact administrator.',
        },
        { status: 500 }
      );
    }

    // Generic error handling
    return handleApiError(error, 'Failed to generate image description');
  }
}
