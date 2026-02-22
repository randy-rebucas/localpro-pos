import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    const t = await getValidationTranslatorFromRequest(request);

    // Check for a token first; if none exists return 200 with no user (not a 401)
    const hasToken = !!(request.cookies.get('auth-token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', ''));

    const user = await getCurrentUser(request);

    if (!user) {
      if (!hasToken) {
        // No token at all — unauthenticated visitor, no error
        return NextResponse.json({ success: false, user: null });
      }
      // Token present but invalid/expired
      return NextResponse.json({ success: false, error: t('validation.notAuthenticated', 'Not authenticated') }, { status: 401 });
    }

    await connectDB();
    const userDoc = await User.findById(user.userId)
      .select('-password')
      .lean();

    if (!userDoc || !userDoc.isActive) {
      return NextResponse.json({ success: false, error: t('validation.userNotFoundOrInactive', 'User not found or inactive') }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        _id: userDoc._id,
        email: userDoc.email,
        name: userDoc.name,
        role: userDoc.role,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

