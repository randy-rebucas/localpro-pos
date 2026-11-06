import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 2048;

/** Binds a token to one form, so a token solved on one form can't be spent on another. */
export type TurnstileAction = 'signup' | 'login' | 'super_admin_login';

interface VerifyOptions {
  action: TurnstileAction;
  ip?: string;
  /** What to do when Cloudflare can't be reached: logins stay up, signups wait. */
  onOutage: 'allow' | 'block';
}

/**
 * Enforced only when both keys are set. With the secret alone no widget renders,
 * so every form would fail and staff would be locked out.
 */
function isEnforced() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/** Returns whether the request may continue. Call it after rate limiting. */
export async function verifyTurnstile(token: unknown, { action, ip, onOutage }: VerifyOptions): Promise<boolean> {
  if (!isEnforced()) {
    if (process.env.NODE_ENV === 'production') logger.warn('Turnstile is not configured; public forms are unprotected');
    return true;
  }

  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) return false;

  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY as string, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`siteverify responded ${res.status}`);

    const result = (await res.json()) as {
      success?: boolean;
      action?: string;
      metadata?: { result_with_testing_key?: boolean };
      'error-codes'?: string[];
    };
    if (!result.success) {
      logger.warn('Turnstile rejected a token', { action, errors: result['error-codes'] });
      return false;
    }
    // Cloudflare's test keys return no action. Real secrets never set this flag.
    if (result.action !== action && !result.metadata?.result_with_testing_key) {
      logger.warn('Turnstile token used on the wrong form', { expected: action, received: result.action });
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Turnstile verification unavailable:', error);
    return onOutage === 'allow';
  }
}

export function turnstileFailedResponse(message: string) {
  return NextResponse.json({ success: false, error: message, code: 'TURNSTILE_FAILED' }, { status: 403 });
}
