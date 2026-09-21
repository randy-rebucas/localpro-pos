import { logger } from '@/lib/logger';

interface RecaptchaVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Verifies a reCAPTCHA token server-side via the classic siteverify REST
 * endpoint (site key + secret key — no GCP service account needed).
 * Returns true when verification is disabled (no secret configured), so
 * local/dev environments without reCAPTCHA keys are not blocked.
 */
export async function verifyRecaptcha(token: string | undefined | null, remoteIp?: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set('remoteip', remoteIp);

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = (await res.json()) as RecaptchaVerifyResponse;
    if (!data.success) {
      logger.error('reCAPTCHA verification failed', { errorCodes: data['error-codes'] });
    }
    return data.success === true;
  } catch (error) {
    logger.error('reCAPTCHA verification request failed', { error });
    return false;
  }
}
