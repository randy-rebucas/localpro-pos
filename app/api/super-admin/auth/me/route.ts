import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const payload = await getCurrentUser(request);

    if (!payload || payload.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { id, ...rest } = user;

    return NextResponse.json({
      success: true,
      user: { _id: id, ...rest },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to get user' }, { status: 500 });
  }
}
