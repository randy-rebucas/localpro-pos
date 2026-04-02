# Image URL Construction Audit

## Summary
This audit identifies all locations in the codebase where image/file URLs are being constructed, particularly focusing on:
- Places where BASE_URL or http://localhost:3000 is prepended
- Code that constructs /uploads/ paths
- Potential double slash issues

## Key Findings

### ✅ CORRECT - Upload Endpoint (Relative URLs)
**File:** [app/api/upload/route.ts](app/api/upload/route.ts#L81)
```typescript
const url = `/uploads/${tenantId}/${filename}`;
```
- Returns **relative URL** (no BASE_URL prepending)
- Correct approach - browser handles protocol/domain

---

### ✅ CORRECT - File Upload Page (Fallback)
**File:** [app/[tenant]/[lang]/admin/file-upload/page.tsx](app/[tenant]/[lang]/admin/file-upload/page.tsx#L151)
```typescript
url: data.data.url || `/uploads/${tenant}/${file.name}`,
```
- Uses API response URL first (which returns relative path)
- Falls back to relative path construction
- No BASE_URL prepending

---

### ✅ CORRECT - Image Component Usage
**Files:**
- [components/ProductModal.tsx](components/ProductModal.tsx#L623)
- [app/[tenant]/[lang]/page.tsx](app/[tenant]/[lang]/page.tsx#L1334)
- [app/[tenant]/[lang]/page.tsx](app/[tenant]/[lang]/page.tsx#L2013)
- [app/[tenant]/[lang]/inventory/page.tsx](app/[tenant]/[lang]/inventory/page.tsx#L305)

```typescript
// ProductModal example
src={formData.image}

// Next.js Image component
<Image
  src={formData.image}
  alt="Preview"
  width={80}
  height={80}
/>
```
- Uses image URLs **as-is** directly from form/API data
- No URL construction or prepending
- Next.js Image component handles optimization

---

### ✅ CORRECT - Receipt Templates (Template Variables)
**Files:**
- [lib/receipt-templates.ts](lib/receipt-templates.ts#L78)
- [lib/hardware/receipt-printer.ts](lib/hardware/receipt-printer.ts#L526)

```typescript
// receipt-templates.ts (Handlebars template)
{{#if logo}}<img src="{{logo}}" alt="Logo" ... />{{/if}}

// receipt-printer.ts (Template literal)
${data.logo ? `<img src="${data.logo}" alt="Logo" ... />` : ''}
```
- Uses logo URL **as-is** from data object
- No BASE_URL prepending
- Expected to receive full URL (http/https) from client

---

### ✅ CORRECT - PayPal Integration (Callback URLs)
**File:** [lib/paypal.ts](lib/paypal.ts#L33)
```typescript
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const returnUrl = `${baseUrl}/api/paypal/success?${planParams}`;
const cancelUrl = `${baseUrl}${tenantPath}/subscription/payment-cancel?${planParams}`;
```
- Correctly uses BASE_URL for **server-side callback URLs** (not image URLs)
- Appropriate use case: PayPal needs full URLs to redirect users back
- Not related to image paths

---

### ✅ CORRECT - Metadata Base URL
**File:** [app/layout.tsx](app/layout.tsx#L21)
```typescript
metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
```
- Uses NEXT_PUBLIC_APP_URL for SEO metadata
- Not related to image URL construction
- Correct for generating canonical URLs

---

### ⚠️ ENVIRONMENT VARIABLES

**File:** [.env.local](.env.local)

| Variable | Value | Purpose |
|----------|-------|---------|
| `BASE_URL` | `http://localhost:3000` | Server-side callback URLs (PayPal, etc.) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS configuration |
| `NEXT_PUBLIC_APP_URL` | *(not set)* | Falls back to `http://localhost:3000` |
| `NODE_ENV` | `development` | Development mode |

---

### ✅ CORRECT - Next.js Image Optimization Config
**File:** [next.config.ts](next.config.ts#L38-L51)

```typescript
images: {
  remotePatterns: [
    // Allow localhost uploads in development
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '3000',
      pathname: '/uploads/**',
    },
    // Allow OpenAI DALL-E images
    {
      protocol: 'https',
      hostname: '*.blob.core.windows.net',
      pathname: '/private/**',
    },
  ],
}
```
- Correctly whitelists `/uploads/**` paths on localhost:3000
- Allows optimization of remote images from allowed sources
- **Note:** The config assumes relative paths will be served from the app origin

---

## URL Construction Patterns Analysis

### Image Sources in Code
1. **User Input (ProductModal):** HTTPS URLs only required via validation
2. **API Responses (Upload endpoint):** Relative paths (`/uploads/{tenantId}/{filename}`)
3. **External APIs (OpenAI):** Full HTTPS URLs
4. **Database Fields:** Can be relative or absolute URLs

### No Double Slash Issues Found
✅ No code concatenates `BASE_URL + /uploads/` (which would create `http://localhost:3000//uploads/...`)
✅ All relative paths start with single `/`
✅ All BASE_URL uses are server-side for callbacks, not image paths

---

## Recommendations

### 1. Production Deployment
When deploying to production, ensure:
- Set `BASE_URL=https://yourdomain.com` in production .env
- Add production domain to `remotePatterns` in next.config.ts:
```typescript
{
  protocol: 'https',
  hostname: 'yourdomain.com',
  pathname: '/uploads/**',
},
```

### 2. Image URL Validation
The validation in [lib/validation.ts](lib/validation.ts#L99) requires HTTPS URLs for product images, which is good:
```typescript
if (image && !/^https?:\/\/.+/.test(image)) {
  errors.push({ field: 'image', message: '...' });
}
```

### 3. Receipt Logo URLs
Ensure logos are stored with full URLs (https://...) before passing to receipt templates.

### 4. Optional: Helper Function
Consider adding a utility for consistent image URL handling:
```typescript
// lib/image-utils.ts
export function getImageUrl(path: string, isAbsolute = false): string {
  if (path.startsWith('http')) return path; // Already absolute
  if (!isAbsolute) return path; // Return relative
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}${path}`;
}
```

---

## Test Considerations

When testing image loading:
- ✅ Test relative paths: `/uploads/{tenantId}/{filename}`
- ✅ Test absolute paths: `http://localhost:3000/uploads/{tenantId}/{filename}`
- ✅ Test external URLs: `https://cdn.example.com/image.jpg`
- ✅ Verify no double slashes are created during URL construction

---

## Summary Table

| Location | Type | URL Type | Status | Issue |
|----------|------|----------|--------|-------|
| Upload endpoint | API | Relative | ✅ Correct | None |
| ProductModal | Component | As-is | ✅ Correct | None |
| Receipt printer | Template | As-is | ✅ Correct | Requires full URL input |
| PayPal helper | Server | Absolute | ✅ Correct | Not image-related |
| Image config | Config | Whitelisted | ✅ Correct | None |

