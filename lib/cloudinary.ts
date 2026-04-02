/**
 * Cloudinary integration with tenant isolation
 * Files are stored in folder: tenants/{tenantId}/
 * All files tagged with: tenantId for easier querying and access control
 */

interface CloudinaryUploadResult {
  public_id: string;
  url: string;
  secure_url: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
}

interface CloudinaryErrorResponse {
  error: {
    message: string;
  };
}

/**
 * Upload file to Cloudinary with tenant isolation
 * Files are organized in: tenants/{tenantId}/
 * Tagged with tenantId for access control and querying
 */
export async function uploadToCloudinary(
  fileBuffer: Buffer,
  filename: string,
  tenantId: string,
  fileType: string
): Promise<CloudinaryUploadResult> {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (!cloudinaryUrl) {
    throw new Error('CLOUDINARY_URL environment variable not configured');
  }

  // Extract credentials from CLOUDINARY_URL
  // Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  const url = new URL(cloudinaryUrl);
  const cloudName = url.hostname;
  const apiKey = url.username;
  const apiSecret = url.password;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Invalid CLOUDINARY_URL format. Expected: cloudinary://API_KEY:API_SECRET@CLOUD_NAME');
  }

  // Tenant isolation: organize by folder and tag
  // Folder: tenants/{tenantId} - provides URL organization
  // Tags: [tenantId, fileType] - for querying and access control
  // Note: publicId should NOT include folder (folder param handles directory structure)
  const publicId = `${Date.now()}-${Math.random().toString(36).substring(7)}-${filename}`;
  const folderValue = `tenants/${tenantId}`;
  const tags = `${tenantId},${fileType.split('/')[0]}`;

  // Create signature for signed upload (more secure than unsigned)
  const crypto = await import('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Build signature: alphabetically ordered params + api_secret
  // Format: param1=value1&param2=value2&...&paramN=valueN{api_secret}
  const contextValue = `tenantId=${tenantId}`;
  
  // Build the signature string in alphabetical order (Cloudinary requirement)
  const signatureParams = [
    `context=${contextValue}`,
    `folder=${folderValue}`,
    `public_id=${publicId}`,
    `tags=${tags}`,
    `timestamp=${timestamp}`,
  ].sort();
  
  const signatureString = signatureParams.join('&') + apiSecret;
  const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

  // Prepare form data
  const formData = new FormData();
  const blob = new Blob([fileBuffer as unknown as BufferSource], { type: fileType });
  formData.append('file', blob, filename);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('public_id', publicId);
  formData.append('tags', tags);
  formData.append('folder', folderValue);
  formData.append('context', `tenantId=${tenantId}`);

  try {
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = (await response.json()) as CloudinaryErrorResponse;
      throw new Error(`Cloudinary upload failed: ${errorData.error.message}`);
    }

    return (await response.json()) as CloudinaryUploadResult;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Cloudinary upload error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Delete file from Cloudinary
 * Only admins can delete files from other users, tenant isolation enforced at API level
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (!cloudinaryUrl) {
    throw new Error('CLOUDINARY_URL environment variable not configured');
  }

  const url = new URL(cloudinaryUrl);
  const cloudName = url.hostname;
  const apiKey = url.username;
  const apiSecret = url.password;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Invalid CLOUDINARY_URL format');
  }

  // Sign the deletion request (required for signed operations)
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureInput = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const crypto = await import('crypto');
  const signature = crypto.createHash('sha1').update(signatureInput).digest('hex');

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);

  try {
    const deleteUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;

    const response = await fetch(deleteUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = (await response.json()) as CloudinaryErrorResponse;
      throw new Error(`Cloudinary delete failed: ${errorData.error.message}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Cloudinary delete error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get transformation URL for Cloudinary image
 * Useful for resizing, optimizing images served from Cloudinary
 */
export function getCloudinaryImageUrl(
  publicId: string,
  options?: {
    width?: number;
    height?: number;
    quality?: string;
  }
): string {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) {
    throw new Error('CLOUDINARY_URL not configured');
  }

  const url = new URL(cloudinaryUrl);
  const cloudName = url.hostname;

  let path = `https://res.cloudinary.com/${cloudName}/image/fetch`;

  if (options && (options.width || options.height || options.quality)) {
    path = `https://res.cloudinary.com/${cloudName}/image/upload`;

    const transforms: string[] = [];
    if (options.width) transforms.push(`w_${options.width}`);
    if (options.height) transforms.push(`h_${options.height}`);
    if (options.quality) transforms.push(`q_${options.quality}`);

    if (transforms.length > 0) {
      path += `/${transforms.join(',')}`;
    }
  }

  return `${path}/${publicId}`;
}
