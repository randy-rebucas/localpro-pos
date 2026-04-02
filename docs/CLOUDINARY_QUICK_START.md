# Cloudinary Quick Start (5 minutes)

## 1️⃣ Get Credentials (2 min)

1. Visit https://dashboard.cloudinary.com/
2. Sign in or create free account
3. Go to **Settings** → **API Keys**
4. Copy: **Cloud Name**, **API Key**, **API Secret**

## 2️⃣ Create Upload Preset (1 min)

1. Go to **Settings** → **Upload**
2. Click **Add preset**
3. Name: `unsigned_upload`
4. Mode: **Unsigned**
5. Save

## 3️⃣ Update .env.local (1 min)

```bash
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@YOUR_CLOUD_NAME
CLOUDINARY_UPLOAD_PRESET=unsigned_upload
```

**Example:**
```bash
CLOUDINARY_URL=cloudinary://987654321:xyz-123-abc@demo-cloud
CLOUDINARY_UPLOAD_PRESET=unsigned_upload
```

## 4️⃣ Restart Dev Server (1 min)

```bash
pnpm dev
```

## ✅ Done!

Files now upload to Cloudinary with automatic tenant isolation:
- 📁 Folder: `tenants/{tenantId}/`
- 🏷️ Tags: `{tenantId}`, `image/document/spreadsheet`
- 🔒 Only authenticated users can access their tenant's files
- ⚡ 50 uploads/hour rate limit per user

Test it: Navigate to **File Upload** page and upload a file!

---

**Need help?** See [CLOUDINARY_SETUP.md](./CLOUDINARY_SETUP.md) for full documentation.
