import jwt from 'jsonwebtoken';

const TYP = 'ecom_shopify_oauth';

function jwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';
}

export function signShopifyOAuthState(data: { tenantId: string; tenantSlug: string; lang?: string }): string {
  return jwt.sign({ ...data, typ: TYP }, jwtSecret(), { expiresIn: '15m' });
}

export function verifyShopifyOAuthState(token: string): {
  tenantId: string;
  tenantSlug: string;
  lang: string;
} | null {
  try {
    const p = jwt.verify(token, jwtSecret()) as {
      tenantId: string;
      tenantSlug: string;
      lang?: string;
      typ?: string;
    };
    if (p.typ !== TYP) return null;
    return { tenantId: p.tenantId, tenantSlug: p.tenantSlug, lang: p.lang === 'es' ? 'es' : 'en' };
  } catch {
    return null;
  }
}
