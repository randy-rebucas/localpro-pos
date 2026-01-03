import { NextRequest, NextResponse } from 'next/server';
import { generateGuestId, generateGuestToken } from '@/lib/auth-guest';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST - Create a guest session
 * Body: { tenantSlug?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { tenantSlug } = body;

    // Get tenant ID
    const Tenant = (await import('@/models/Tenant')).default;
    const { default: connectDB } = await import('@/lib/mongodb');
    await connectDB();
    
    const tenant = await Tenant.findOne({ 
      slug: tenantSlug || 'default', 
      isActive: true 
    }).lean();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Generate guest ID and token
    const guestId = generateGuestId();
    const token = generateGuestToken({
      guestId,
      tenantId: tenant._id.toString(),
      type: 'guest',
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      data: {
        guestId,
        tenantId: tenant._id.toString(),
        token,
      },
    });

    response.cookies.set('guest-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Create guest session error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create guest session' },
      { status: 500 }
    );
  }
}
