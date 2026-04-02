# Cloudinary Integration Guide

## Overview

Files are now stored in **Cloudinary** with automatic **tenant isolation**:

- **Folder Structure**: `tenants/{tenantId}/` - Each tenant's files are isolated in their own folder
- **Tagging System**: Files tagged with `{tenantId}` and file type category for access control and querying
- **Metadata**: Context stored with each file for audit trails and tenant tracking
- **Rate Limiting**: 50 uploads per hour per user

## Setup Instructions

### 1. Create a Cloudinary Account

- Go to [Cloudinary Dashboard](https://dashboard.cloudinary.com/)
- Sign up for a free account (includes 25 GB storage and 25 GB bandwidth)
- Once signed in, go to **Settings** > **API Keys**

### 2. Get Your Credentials

In the API Keys section, you'll find:
- **Cloud Name** (displayed at top)
- **API Key** 
- **API Secret**

### 3. Configure Environment Variables

Add to `.env.local`:

```bash
# Cloudinary Configuration (File Storage with Tenant Isolation)
# Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
CLOUDINARY_URL=cloudinary://YOUR_API_KEY:YOUR_API_SECRET@YOUR_CLOUD_NAME
CLOUDINARY_UPLOAD_PRESET=unsigned_upload
```

**Example:**
```bash
CLOUDINARY_URL=cloudinary://123456789:abc-def-ghi@mycloud
CLOUDINARY_UPLOAD_PRESET=unsigned_upload
```

### 4. Create an Unsigned Upload Preset (Required)

This allows frontend to upload directly without exposing API secret:

1. Go to **Settings** > **Upload**
2. Scroll to **Upload presets**
3. Click **Add unsigned preset**
4. Name it: `unsigned_upload`
5. Set **Signing Mode** to **Unsigned**
6. Save

### 5. Enable Folder Organization (Optional but Recommended)

In **Settings** > **Upload**:
- Enable **Use filename as display name**
- This makes folder structure clear in Cloudinary dashboard

## Tenant Isolation Strategy

### Folder-Based Isolation

Files are stored in: `tenants/{tenantId}/{timestamp}-{random}-{filename}`

**Benefits:**
- ✅ Clear organization in Cloudinary dashboard
- ✅ Easy to view all files for a tenant
- ✅ Folder-level access control (if using signed URLs)

### Tag-Based Access Control

Each file is tagged with:
- **Tenant ID** - For querying and listing tenant's files
- **File Category** (image/document/spreadsheet) - For filtering

**Database Query Example:**
```javascript
// All files for a tenant
File.find({ tenantId: "610a456..." })

// All images for a tenant
File.find({ tenantId: "610a456...", type: { $regex: "^image/" } })
```

### Metadata Tracking

Context stored with each file:
```
context: tenantId=610a456...
```

This enables:
- Audit trails for GDPR compliance
- Tenant-specific analytics
- Cost allocation per tenant

## Security Features

### 1. **Tenant Isolation Enforced at API Level**

```typescript
// API endpoint checks tenant ownership
const tenantId = await getTenantIdFromRequest(request); // From verified JWT
// Only upload if tenantId matches authenticated user's tenant
```

**Not trusting client-supplied tenantId**.

### 2. **File Type Validation**

Whitelist of allowed types (images, PDFs, spreadsheets):
- `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- `application/pdf`
- `text/csv`
- `application/vnd.ms-excel`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

### 3. **Size Limit: 10MB per file**

Prevents abuse and storage costs.

### 4. **Rate Limiting: 50 uploads/hour per user**

Per-user rate limiting prevents rapid-fire uploads.

### 5. **Database Records for Auditing**

Every upload creates a database record:
```javascript
{
  tenantId,
  name,
  filename,          // Cloudinary public_id
  size,
  type,
  url,               // Cloudinary secure_url
  uploadedBy,        // User ID
  uploadedAt,
  createdAt,
  updatedAt
}
```

Plus audit log via `createAuditLog()`:
```javascript
{
  action: 'upload_file',
  entityType: 'File',
  metadata: {
    fileName,
    fileSize,
    fileType,
    cloudinaryPublicId
  }
}
```

## API Endpoints

### Upload File

```bash
POST /api/upload
Content-Type: multipart/form-data

Body:
- file: <binary file data>

Response:
{
  "success": true,
  "data": {
    "id": "610a456...",
    "url": "https://res.cloudinary.com/...",
    "filename": "tenants/610a456.../1234567-abc-photo.jpg",
    "size": 245000,
    "type": "image/jpeg",
    "uploadedAt": "2024-04-02T..."
  }
}
```

### List Files for Tenant

```bash
GET /api/upload

Response:
{
  "success": true,
  "data": [
    {
      "id": "610a456...",
      "name": "photo.jpg",
      "size": 245000,
      "type": "image/jpeg",
      "url": "https://res.cloudinary.com/...",
      "uploadedAt": "2024-04-02T..."
    }
  ]
}
```

**Note:** Only authenticated users see their tenant's files.

## Dashboard Organization

In **Cloudinary Dashboard**:

Navigate to **Media Library** → **Folders** → **tenants**

You'll see:
```
tenants/
  ├── 610a456... (tenant ID)
  │   ├── 1234567-abc-photo.jpg
  │   ├── 1234568-def-document.pdf
  │   └── ...
  ├── 610a789... (another tenant)
  └── ...
```

## File URL Format

Cloudinary URLs follow this pattern:

```
https://res.cloudinary.com/{CLOUD_NAME}/image/upload/{TRANSFORMATIONS}/{PUBLIC_ID}
```

**Examples:**

Basic URL (no transformations):
```
https://res.cloudinary.com/mycloud/image/upload/tenants/610a456/1234567-abc-photo.jpg
```

With optimization (resize, quality):
```
https://res.cloudinary.com/mycloud/image/upload/w_400,h_300,q_auto/tenants/610a456/1234567-abc-photo.jpg
```

## Deleting Files

Deleting a file also removes it from Cloudinary:

```typescript
// API call (signed deletion)
await deleteFromCloudinary(publicId);

// Database record is soft-deleted or removed
await File.deleteOne({ _id: fileId });
```

**Important:** Deletion requires valid signature (prevents unauthorized deletions).

## Monitoring & Costs

### Usage Dashboard

In **Cloudinary Dashboard** → **Usage**:

- Total storage used
- Bandwidth consumed
- Monthly costs
- Per-folder breakdown (by tenant)

### Cost Optimization

Free tier includes:
- 25 GB storage
- 25 GB bandwidth/month
- Unlimited transforms

To optimize costs:
- Enable **Fetch** mode for external images
- Use **CDN caching** (default: 1 year)
- Apply **quality=auto** for responsive images

## Troubleshooting

### "CLOUDINARY_URL not configured"

**Fix:** Add `CLOUDINARY_URL` to `.env.local` and restart dev server

### "Upload failed: Invalid upload preset"

**Fix:** 
1. Verify preset name is `unsigned_upload`
2. Ensure preset is set to **Unsigned**
3. Check Cloud Name matches `CLOUDINARY_URL`

### Files appearing under wrong tenant

This should not happen due to API-level tenant validation. If it does:

1. Check JWT token is valid
2. Verify `getTenantIdFromRequest()` returns correct tenant
3. Check database audit logs for unauthorized access

### Performance: Slow uploads

- Check file size (>10MB will be rejected)
- Verify network connection
- Consider chunking large files

---

**For more:** https://cloudinary.com/documentation
