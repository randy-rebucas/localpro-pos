import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenants = await Tenant.find({ isActive: true }).select('slug name settings').lean();
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const tenant = await Tenant.create(body);
    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

