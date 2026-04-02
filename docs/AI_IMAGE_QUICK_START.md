# AI Image Suggestion - Quick Start (5 minutes)

## ⚡ Fast Setup

### 1️⃣ Get API Key (2 min)
```bash
# Go to: https://platform.openai.com/account/api-keys
# Click "Create new secret key" 
# Copy the key (starts with sk-)
```

### 2️⃣ Add to .env.local (1 min)
Edit `.env.local` in project root and add:
```
OPENAI_API_KEY=sk-your-key-here
```

### 3️⃣ Restart Server (1 min)
```bash
# Stop current: Ctrl+C
pnpm dev
```

### 4️⃣ Try It! (1 min)
1. Go to **Products** page
2. Click **Add Product** (or edit existing)
3. Enter product name (e.g., "Coffee Maker")
4. Click **✨ AI Suggest** button
5. Wait 10-20 seconds for image generation
6. Click **Save Product**

✅ **Done!** Your product now has an AI-generated image.

---

## 🎯 What Was Added?

| File | Purpose |
|------|---------|
| `.env.local` | Added `OPENAI_API_KEY` variable |
| `lib/openai.ts` | Helper functions for DALL-E API calls |
| `app/api/products/suggest-image/route.ts` | Backend endpoint for image generation |
| `components/ProductModal.tsx` | Added "✨ AI Suggest" button & UI |
| `docs/AI_IMAGE_SUGGESTION.md` | Full documentation & troubleshooting |

---

## 🚀 Features

- ✅ Generate pro images with one click
- ✅ Uses DALL-E 3 (OpenAI's latest model)
- ✅ Automatically fills image URL field
- ✅ Rate limited (10 per hour per user)
- ✅ Error handling & validation
- ✅ Loading states & user feedback

---

## 💰 Cost

- **$0.04 per image** (1024x1024 size)
- 10 images = ~$0.40
- 100 images = ~$4.00

Set budget alerts in [OpenAI Dashboard](https://platform.openai.com/account/billing/limits)

---

## ❓ Issues?

See full troubleshooting guide in: `docs/AI_IMAGE_SUGGESTION.md`

Common fixes:
- **"API key not configured"** → Restart server after adding to .env.local
- **"Rate limit exceeded"** → Try again in 1 hour
- **"Content policy violation"** → Use different product name
- **"Timeout"** → Check internet & OpenAI status

---

## 📚 Full Documentation

See: `docs/AI_IMAGE_SUGGESTION.md` for:
- Detailed setup instructions
- API endpoint reference
- Configuration options
- Advanced features
- Cost optimization
- Security notes
