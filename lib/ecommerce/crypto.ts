import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function deriveDevKey(): Buffer {
  const base = process.env.JWT_SECRET || 'dev-only-ecommerce-crypto';
  return crypto.createHash('sha256').update(`ecom:${base}`).digest();
}

/**
 * 32-byte key for AES-256. Set ECOMMERCE_CREDENTIALS_ENCRYPTION_KEY as 64 hex chars or a 32-byte base64 string.
 */
export function getEcommerceEncryptionKey(): Buffer {
  const raw = process.env.ECOMMERCE_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    try {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      /* fall through */
    }
    throw new Error('ECOMMERCE_CREDENTIALS_ENCRYPTION_KEY must be 64 hex chars or base64 encoding 32 bytes');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ECOMMERCE_CREDENTIALS_ENCRYPTION_KEY is required in production');
  }
  return deriveDevKey();
}

/** Encrypt JSON-serializable object to a single base64url-safe string (v1|iv|tag|ciphertext as base64 concat). */
export function encryptCredentialsPayload(obj: Record<string, unknown>): string {
  const key = getEcommerceEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const plaintext = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([Buffer.from('1'), iv, tag, enc]);
  return packed.toString('base64url');
}

export function decryptCredentialsPayload<T extends object>(blob: string): T {
  const key = getEcommerceEncryptionKey();
  const packed = Buffer.from(blob, 'base64url');
  if (packed[0] !== 0x31) {
    throw new Error('Unsupported credential blob version');
  }
  const iv = packed.subarray(1, 1 + IV_LEN);
  const tag = packed.subarray(1 + IV_LEN, 1 + IV_LEN + AUTH_TAG_LEN);
  const enc = packed.subarray(1 + IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}
