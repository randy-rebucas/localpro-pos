/**
 * RFC 6238 TOTP implementation using Node.js crypto
 * Compatible with Google Authenticator, Authy, etc.
 */
import crypto from 'crypto';
import QRCode from 'qrcode';
import { MFA_TOTP_WINDOW } from '@/lib/auth-config';

const STEP = 30; // 30-second time step (RFC 6238 standard — do not change)
const DIGITS = 6; // 6-digit codes (RFC 6238 standard — do not change)
const WINDOW = MFA_TOTP_WINDOW; // Clock-drift tolerance; set MFA_TOTP_WINDOW in env

/**
 * Generate a random base32-encoded secret for TOTP
 */
export function generateTOTPSecret(): string {
  // Generate 20 random bytes and encode as base32
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

/**
 * Generate a TOTP token for the current time
 */
export function generateTOTP(secret: string, timeOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / STEP) + timeOffset;
  return hotp(base32Decode(secret), counter);
}

/**
 * Verify a TOTP token (checks current window and ±WINDOW steps).
 * Returns the matched counter value for replay-attack prevention, or null if invalid.
 * Callers should persist matchedCounter and reject any future code with counter <= lastUsedCounter.
 */
export function verifyTOTP(token: string, secret: string): { valid: true; counter: number } | { valid: false } {
  if (!token || !secret || token.length !== DIGITS) return { valid: false };
  const counter = Math.floor(Date.now() / 1000 / STEP);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    if (hotp(base32Decode(secret), counter + i) === token) {
      return { valid: true, counter: counter + i };
    }
  }
  return { valid: false };
}

/**
 * Build an otpauth:// URI for QR code generation (Google Authenticator format)
 */
export function totpKeyUri(email: string, issuer: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP}`;
}

/**
 * Generate a QR code data URL from an otpauth URI
 */
export async function generateQRCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

// --- HOTP / Base32 helpers ---

function hotp(keyBytes: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuffer.writeUInt32BE(high, 0);
  counterBuffer.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', keyBytes);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return String(code % Math.pow(10, DIGITS)).padStart(DIGITS, '0');
}

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
