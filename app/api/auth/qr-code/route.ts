import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';

/**
 * GET - Get current user's QR code token (generates one if it doesn't exist)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const userDoc = await User.findById(user.userId).select('qrToken name email');
    
    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate QR token if it doesn't exist
    if (!userDoc.qrToken) {
      const newQrToken = user.userId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
      await User.findByIdAndUpdate(user.userId, { qrToken: newQrToken });
      userDoc.qrToken = newQrToken;
    }

    return NextResponse.json({
      success: true,
      data: {
        qrToken: userDoc.qrToken,
        name: userDoc.name,
        email: userDoc.email,
      },
    });
  } catch (error: any) {
    console.error('Get QR code error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get QR code' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

/**
 * POST - Generate or regenerate QR code token for current user
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    // Generate new QR token (or create if doesn't exist)
    const newQrToken = user.userId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
    
    await User.findByIdAndUpdate(user.userId, { qrToken: newQrToken });

    return NextResponse.json({
      success: true,
      data: {
        qrToken: newQrToken,
      },
    });
  } catch (error: any) {
    console.error('Generate/Regenerate QR code error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate QR code' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

