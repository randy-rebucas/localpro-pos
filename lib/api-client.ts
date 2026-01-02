// Track if we're already redirecting to prevent multiple redirects
let isRedirecting = false;

/**
 * Utility function to handle API responses, especially 403 Forbidden (tenant access violations)
 * Automatically redirects to forbidden page if tenant access is denied
 * IMPORTANT: Skips redirect if already on the forbidden page to prevent infinite loops
 */
export async function handleApiResponse<T = any>(
  response: Response,
  options?: {
    redirectOn403?: boolean;
    defaultRedirect?: string;
  }
): Promise<T> {
  const { redirectOn403 = true, defaultRedirect } = options || {};
  
  // Check if we're already on the forbidden page or already redirecting to prevent redirect loops
  const isOnForbiddenPage = typeof window !== 'undefined' && window.location.pathname.includes('/forbidden');
  
  // Check for 403 Forbidden response (tenant access violation)
  if (response.status === 403 && redirectOn403 && !isOnForbiddenPage && !isRedirecting) {
    try {
      const data = await response.json();
      
      // Redirect to forbidden page if redirect URL is provided
      const redirectUrl = data.redirect || defaultRedirect;
      if (redirectUrl && typeof window !== 'undefined') {
        isRedirecting = true;
        window.location.href = redirectUrl;
        // Return a promise that never resolves to prevent further execution
        return new Promise(() => {}) as T;
      }
    } catch (error) {
      // If JSON parsing fails, still try to redirect with default (only if not on forbidden page)
      if (defaultRedirect && typeof window !== 'undefined' && !isOnForbiddenPage && !isRedirecting) {
        isRedirecting = true;
        window.location.href = defaultRedirect;
        return new Promise(() => {}) as T;
      }
    }
    // If no redirect URL available or already on forbidden page, throw error
    throw new Error('Forbidden: Access denied to this tenant');
  }
  
  // For non-403 responses, return the JSON data
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Enhanced fetch wrapper that automatically handles 403 responses
 */
export async function apiFetch<T = any>(
  url: string,
  options?: RequestInit & {
    redirectOn403?: boolean;
    defaultRedirect?: string;
  }
): Promise<T> {
  const { redirectOn403, defaultRedirect, ...fetchOptions } = options || {};
  
  const response = await fetch(url, fetchOptions);
  return handleApiResponse<T>(response, { redirectOn403, defaultRedirect });
}
