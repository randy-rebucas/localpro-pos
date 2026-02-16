/**
 * Centralized configuration management
 */

export const config = {
  // Database
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system',
  },

  // JWT
  jwt: {
    get secret() {
      const secret = process.env.JWT_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_SECRET environment variable is required in production');
      }
      return secret || 'dev-only-insecure-secret-do-not-use-in-production';
    },
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Application
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG || 'default',
  },

  // Security
  security: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    cookieSecure: process.env.NODE_ENV === 'production',
  },

  // Pagination
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },

  // Rate Limiting (for future implementation)
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
} as const;

/**
 * Validate required environment variables
 */
export function validateConfig(): void {
  const required = ['MONGODB_URI'];
  if (process.env.NODE_ENV === 'production') {
    required.push('JWT_SECRET', 'ALLOWED_ORIGINS');
  }
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

