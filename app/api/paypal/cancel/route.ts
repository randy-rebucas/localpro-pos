import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Redirect back to subscription page with cancelled status
  return NextResponse.redirect(new URL('/subscription?payment=cancelled', request.url));
}