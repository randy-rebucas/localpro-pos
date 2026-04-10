/**
 * Centralised auth configuration.
 * All values are driven by environment variables with safe defaults.
 * Edit .env.local (dev) or your secrets manager (prod) — no code changes needed.
 */

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

// ── App lock ───────────────────────────────────────────────────────────────────

/** Minutes of inactivity before the app locks (default: 5). Set 0 to disable. */
export const APP_LOCK_IDLE_MINUTES = int('NEXT_PUBLIC_APP_LOCK_IDLE_MINUTES', 5);

// ── Cookies ────────────────────────────────────────────────────────────────────

/** Staff JWT cookie lifetime in seconds (default: 7 days) */
export const AUTH_COOKIE_MAX_AGE = int('AUTH_COOKIE_MAX_AGE', 60 * 60 * 24 * 7);

/** Customer JWT cookie lifetime in seconds (default: 30 days) */
export const CUSTOMER_COOKIE_MAX_AGE = int('CUSTOMER_COOKIE_MAX_AGE', 60 * 60 * 24 * 30);

// ── MFA / TOTP ─────────────────────────────────────────────────────────────────

/** TOTP clock-drift window in 30-second steps on each side (default: 1 = ±30 s) */
export const MFA_TOTP_WINDOW = int('MFA_TOTP_WINDOW', 1);

/** Number of one-time backup codes generated at MFA setup (default: 8) */
export const MFA_BACKUP_CODES_COUNT = int('MFA_BACKUP_CODES_COUNT', 8);

// ── Customer OTP ───────────────────────────────────────────────────────────────

/** Customer OTP validity period in minutes (default: 10) */
export const OTP_EXPIRY_MINUTES = int('OTP_EXPIRY_MINUTES', 10);

/** Maximum failed OTP verification attempts before the record is locked (default: 5) */
export const OTP_MAX_ATTEMPTS = int('OTP_MAX_ATTEMPTS', 5);

// ── Rate limits ────────────────────────────────────────────────────────────────
// Each entry: { max: requests allowed, windowMs: rolling window in milliseconds }

export const RL = {
  /** Email/password login — per IP */
  login: {
    max:      int('RL_LOGIN_MAX',                10),
    windowMs: int('RL_LOGIN_WINDOW_MS',     900_000), // 15 min
  },
  /** QR-code login — per IP */
  loginQr: {
    max:      int('RL_LOGIN_QR_MAX',              5),
    windowMs: int('RL_LOGIN_QR_WINDOW_MS',  900_000), // 15 min
  },
  /** QR-code regeneration — per authenticated user */
  qrRegen: {
    max:      int('RL_QR_REGEN_MAX',              5),
    windowMs: int('RL_QR_REGEN_WINDOW_MS', 3_600_000), // 1 hr
  },
  /** MFA code submission at login — per IP */
  mfaLogin: {
    max:      int('RL_MFA_LOGIN_MAX',            10),
    windowMs: int('RL_MFA_LOGIN_WINDOW_MS', 900_000), // 15 min
  },
  /** TOTP verify during setup — per IP + userId */
  mfaVerify: {
    max:      int('RL_MFA_VERIFY_MAX',            5),
    windowMs: int('RL_MFA_VERIFY_WINDOW_MS',900_000), // 15 min
  },
  /** Customer OTP send — per IP */
  sendOtp: {
    max:      int('RL_SEND_OTP_MAX',              5),
    windowMs: int('RL_SEND_OTP_WINDOW_MS',  600_000), // 10 min
  },
  /** Customer OTP verify — per IP */
  verifyOtp: {
    max:      int('RL_VERIFY_OTP_MAX',           10),
    windowMs: int('RL_VERIFY_OTP_WINDOW_MS',600_000), // 10 min
  },
  /** Password reset request — per IP */
  resetPasswordIp: {
    max:      int('RL_RESET_PW_IP_MAX',           5),
    windowMs: int('RL_RESET_PW_IP_WINDOW_MS',900_000), // 15 min
  },
  /** Password reset request — per email address */
  resetPasswordEmail: {
    max:      int('RL_RESET_PW_EMAIL_MAX',        3),
    windowMs: int('RL_RESET_PW_EMAIL_WINDOW_MS', 3_600_000), // 1 hr
  },
  /** New account registration — per IP */
  register: {
    max:      int('RL_REGISTER_MAX',              5),
    windowMs: int('RL_REGISTER_WINDOW_MS', 3_600_000), // 1 hr
  },
} as const;
