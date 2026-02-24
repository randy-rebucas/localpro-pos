import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenant = searchParams.get('tenant') || '';
  const lang = searchParams.get('lang') || 'en';
  const basePath = tenant ? `/${tenant}/${lang}` : '';
  return NextResponse.redirect(new URL(`${basePath}/subscription?payment=cancelled`, request.url));
}
