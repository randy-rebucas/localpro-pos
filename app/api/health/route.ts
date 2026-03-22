import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';

export async function GET() {
  const start = Date.now();

  try {
    await connectDB();
    const dbState = mongoose.connection.readyState;
    const dbOk = dbState === 1; // 1 = connected

    return NextResponse.json({
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbOk ? 'connected' : 'disconnected',
      responseTime: `${Date.now() - start}ms`,
    }, { status: dbOk ? 200 : 503 });
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
