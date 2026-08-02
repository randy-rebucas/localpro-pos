import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      responseTime: `${Date.now() - start}ms`,
    }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: (error as Error).message,
      responseTime: `${Date.now() - start}ms`,
    }, { status: 503 });
  }
}
