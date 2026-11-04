import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const payload = await getCurrentUser(request);

    if (!payload || payload.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getRepos().users.findById(payload.userId, { select: 'email name role isActive' });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to get user' }, { status: 500 });
  }
}
