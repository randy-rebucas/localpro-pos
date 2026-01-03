import { NextRequest, NextResponse } from 'next/server';

/**
 * POST - Logout guest session
 */
export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Guest session cleared',
    });

    // Clear the guest token cookie
    response.cookies.set('guest-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Expire immediately
    });

    return response;
  } catch (error: any) {
    console.error('Guest logout error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Logout failed' },
      { status: 500 }
    );
  }
}
