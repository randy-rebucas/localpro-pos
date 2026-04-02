/**
 * Image URL utilities for safe and normalized image handling
 */

/**
 * Normalize an image URL to ensure it's a valid absolute URL
 * @param url - The image URL (can be relative, protocol-relative, or absolute)
 * @returns Normalized absolute URL safe for Next.js Image component
 */
export function normalizeImageUrl(url?: string): string {
  if (!url) return '';

  let normalized = String(url).trim();

  // If it's already a valid absolute URL with protocol, clean up any double slashes
  if (/^https?:\/\//.test(normalized)) {
    // Remove double slashes except after protocol
    return normalized.replace(/([^:]\/)\/+/g, '$1');
  }

  // Handle protocol-relative URLs
  if (normalized.startsWith('//')) {
    // Check if it's a proper protocol-relative URL (//hostname/path)
    // Proper hostnames have a dot (cdn.example.com) or are well-known (localhost, etc)
    const afterSlash = normalized.substring(2);
    const isProperHostname = /^[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+/.test(afterSlash) || 
                              /^(localhost|127\.0\.0\.1)/.test(afterSlash);

    if (isProperHostname) {
      // Convert proper protocol-relative URLs to https
      return normalized.replace(/^\/\//, 'https://');
    } else {
      // This is a malformed URL like //uploads/... → convert to /uploads/...
      normalized = normalized.substring(1);
    }
  }

  // Handle relative paths (/uploads/...)
  if (normalized.startsWith('/')) {
    // Build absolute URL using current origin
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}${normalized}`;
    }
    // Server-side: use environment variable or default
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return `${baseUrl}${normalized}`;
  }

  // Handle relative paths without leading slash (uploads/...)
  if (!normalized.startsWith('http')) {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}/${normalized}`;
    }
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return `${baseUrl}/${normalized}`;
  }

  // If all else fails, return as-is
  return normalized;
}

/**
 * Convert a relative path to absolute URL (for non-Image components)
 * Only use this when Next.js Image component can't be used
 * @param path - Relative path like /uploads/...
 * @returns Full URL like http://localhost:3000/uploads/...
 */
export function toAbsoluteUrl(path: string): string {
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  return `${baseUrl}${path}`;
}

/**
 * Check if URL is absolute (starts with http/https)
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}
