import { NextRequest, NextResponse } from 'next/server';

// Only allow alphanumeric slugs and hyphens to prevent open-redirect via crafted paths.
const SAFE_SLUG = /^[a-zA-Z0-9-]{1,64}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawTenant = searchParams.get('tenant') || '';
  const rawLang = searchParams.get('lang') || 'en';

  // Validate path segments before building redirect URL (prevent open redirect).
  const tenant = SAFE_SLUG.test(rawTenant) ? rawTenant : '';
  const lang = SAFE_SLUG.test(rawLang) ? rawLang : 'en';

  const basePath = tenant ? `/${tenant}/${lang}` : '';
  return NextResponse.redirect(new URL(`${basePath}/subscription?payment=cancelled`, request.url));
}
