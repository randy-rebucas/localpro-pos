import { NextRequest, NextResponse } from 'next/server';
import { getCurrentGuest } from '@/lib/auth-guest';

/**
 * GET - Get current guest session
 */
export async function GET(request: NextRequest) {
  try {
    const guest = await getCurrentGuest(request);
    
    if (!guest) {
      return NextResponse.json(
        { success: false, error: 'No guest session' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      guest: {
        guestId: guest.guestId,
        tenantId: guest.tenantId,
        type: 'guest',
      },
    });
  } catch (error: unknown) {
    console.error('Get guest error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get guest session' },
      { status: 500 }
    );
  }
}
