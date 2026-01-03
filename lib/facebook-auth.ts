/**
 * Facebook Authentication Utilities
 * 
 * This module provides utilities for verifying Facebook access tokens
 * and retrieving user information from Facebook Graph API.
 */

interface FacebookUserInfo {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

/**
 * Verify Facebook access token and get user information
 * @param accessToken Facebook access token from client
 * @returns Facebook user information or null if invalid
 */
export async function verifyFacebookToken(accessToken: string): Promise<FacebookUserInfo | null> {
  try {
    // Verify token and get user info from Facebook Graph API
    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,email,first_name,last_name,name,picture&access_token=${accessToken}`
    );

    if (!response.ok) {
      console.error('Facebook token verification failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    // Check if Facebook returned an error
    if (data.error) {
      console.error('Facebook API error:', data.error);
      return null;
    }

    // Verify the token is valid by checking the app ID (optional but recommended)
    // This requires FACEBOOK_APP_ID to be set in environment variables
    if (process.env.FACEBOOK_APP_ID) {
      const debugResponse = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`
      );

      if (debugResponse.ok) {
        const debugData = await debugResponse.json();
        if (debugData.data?.app_id !== process.env.FACEBOOK_APP_ID) {
          console.error('Facebook token app ID mismatch');
          return null;
        }
        if (!debugData.data?.is_valid) {
          console.error('Facebook token is invalid');
          return null;
        }
      }
    }

    return data as FacebookUserInfo;
  } catch (error) {
    console.error('Error verifying Facebook token:', error);
    return null;
  }
}

/**
 * Extract name parts from full name
 * @param fullName Full name string
 * @returns Object with firstName and lastName
 */
export function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}
