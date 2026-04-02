# AI Image Suggestion Feature - Setup Guide

## Overview
This feature uses OpenAI's DALL-E 3 to automatically generate product images based on product names. Users can click "✨ AI Suggest" button in the Product Modal to generate a professional product image instantly.

## Setup Instructions

### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the generated API key
5. **Keep it secure** - never commit it to version control

### 2. Configure Environment Variables

Add your OpenAI API key to `.env.local`:

```bash
# OpenAI API (for AI image suggestions)
OPENAI_API_KEY=sk-your-actual-key-here
```

**Location**: Project root directory (`.env.local`)

### 3. Restart Development Server

After adding the environment variable, restart your dev server:

```bash
pnpm dev
```

## Features

### ✨ AI Image Suggestion Button
- Located in Product Modal next to Image URL field
- Generates professional product images using DALL-E 3
- Requires product name (at least 1 character)
- Automatically fills the Image URL field with generated image

### Loading State
- Shows spinner and "Generating..." while creating image
- Button is disabled while generating
- Button is disabled if product name is empty

### Error Handling
- Clear error messages if API fails
- Shows specific errors (e.g., content policy violations)
- Handles network timeouts gracefully
- Admin notification if OpenAI API key is not configured

### Rate Limiting
- Limited to 10 image generations per hour per user
- Prevents accidental API quota exhaustion
- Respects OpenAI API rate limits

## How to Use

### For End Users:

1. **Create/Edit Product**
   - Open Product Modal (create new or edit existing)
   - Fill in product name (required for AI suggestion)

2. **Generate Image**
   - Click "✨ AI Suggest" button next to Image URL field
   - Wait for generation (typically 10-20 seconds)
   - AI generates professional product image based on name

3. **Review & Save**
   - Preview appears below the input field
   - Click "Save Product" to complete

### Example Use Cases:

- **Coffee Maker** → Professional kitchen appliance photo
- **Wireless Headphones** → Professional electronics photo
- **Running Shoes** → Professional footwear photo
- **Organic Olive Oil** → Professional product packaging photo

## API Endpoint

### POST `/api/products/suggest-image`

**Request:**
```json
{
  "productName": "Coffee Maker"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "imageUrl": "https://oaidalleapiprodscus.blob.core.windows.net/private/..."
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Product description violates OpenAI content policy..."
}
```

**Status Codes:**
- `200` - Image generated successfully
- `400` - Invalid input (empty name, too long, content policy violation)
- `429` - Rate limit exceeded (10 per hour)
- `500` - Server error (API key not configured, API failure)

**Authentication:** Required (Bearer token or auth cookie)

## Troubleshooting

### "OpenAI API key is not configured"
**Solution:** 
- Add `OPENAI_API_KEY` to `.env.local`
- Restart dev server with `pnpm dev`
- Check that the key starts with `sk-`

### "Too many image suggestions. Please try again later"
**Solution:**
- Wait 1 hour for rate limit to reset
- Or increase rate limit in `/api/products/suggest-image/route.ts` (line ~15)

### "Content policy violation"
**Solution:**
- Try a different product name
- Avoid potentially sensitive or inappropriate terms
- OpenAI filters explicit/harmful content automatically

### "Failed to generate image" (timeout)
**Solution:**
- Check internet connection
- Check OpenAI API status: https://status.openai.com
- Verify API key is valid and has available credits
- Try again in a few moments

### Generated image is not loading
**Solution:**
- OpenAI image URLs expire after ~1 hour
- Generate a new image if needed
- Or save/upload image to your server using the Upload feature

## Configuration Options

### Adjust Rate Limits
Edit `/api/products/suggest-image/route.ts`:

```typescript
// Current: 10 per hour
const rateLimitResult = await checkRateLimit('suggest-image', 10, 3600000);

// To change to 20 per day:
const rateLimitResult = await checkRateLimit('suggest-image', 20, 86400000);
```

### Adjust Image Quality/Size
Edit `/lib/openai.ts` in the `generateProductImage` function:

```typescript
body: JSON.stringify({
  model: 'dall-e-3',
  prompt,
  n: 1,
  size: '1024x1024',  // Options: '1024x1024', '1792x1024', '1024x1792'
  quality: 'standard', // Options: 'standard', 'hd'
  response_format: 'url',
}),
```

### Customize Prompt
Edit `/lib/openai.ts` to change how product names are converted to image prompts:

```typescript
const prompt = `Professional product photo of a ${productName.trim()}. High quality, well-lit, clean background, product-focused photography style. Suitable for e-commerce.`;
```

## Cost Considerations

### Pricing (as of 2025)
- **DALL-E 3** (1024x1024): $0.04 per image
- Example: 100 images generated = ~$4 USD

### Budget Tracking
1. Go to [OpenAI Billing](https://platform.openai.com/account/billing/overview)
2. Set usage limits and alerts
3. Monitor API costs regularly

### Optimization
- Rate limit (10/hour) prevents runaway costs
- Users should review previews before saving
- Delete unused generated images to save storage

## Advanced Features

### Future Enhancements
- [ ] Multiple image generation (choose from 3 options)
- [ ] Custom style selection (minimalist, realistic, artistic, etc.)
- [ ] Image editing/variation support
- [ ] Batch image generation for multiple products
- [ ] Integration with image upload to save permanently to server
- [ ] Caching generated images to avoid re-generation

## Support & Monitoring

### Logs
Check application logs for image generation:
```bash
grep -i "AI\|image.*generat" logs/application.log
```

### Metrics
Monitor in application dashboard:
- Total images generated
- Successful vs failed generations
- Average generation time
- API errors and rate limits

## Security Notes

- API key stored in environment variables (never exposed to client)
- All requests require authentication
- Tenant isolation enforced
- Rate limiting prevents abuse
- Input validation on product names (max 200 chars)
- Content policy filtering by OpenAI

## References

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [DALL-E Image Generation](https://platform.openai.com/docs/guides/images)
- [API Rate Limits](https://platform.openai.com/docs/guides/rate-limits)
- [Pricing](https://openai.com/pricing#image-models)
