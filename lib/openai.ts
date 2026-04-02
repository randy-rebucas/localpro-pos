/**
 * OpenAI Integration Helper
 * Provides utilities for AI-powered features like image suggestion
 */

interface DallEImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

/**
 * Generate an image using DALL-E based on product name
 * @param productName - The product name to generate image for
 * @returns URL of the generated image
 */
export async function generateProductImage(productName: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured in environment variables');
  }

  if (!productName || productName.trim().length === 0) {
    throw new Error('Product name is required for image generation');
  }

  const prompt = `Professional product photo of a ${productName.trim()}. High quality, well-lit, clean background, product-focused photography style. Suitable for e-commerce.`;

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `OpenAI API error: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data: DallEImageResponse = await response.json();

    if (!data.data || data.data.length === 0 || !data.data[0].url) {
      throw new Error('No image URL returned from DALL-E');
    }

    return data.data[0].url;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to generate image with OpenAI DALL-E');
  }
}

/**
 * Generate image description for a product (for alternative implementation)
 * @param productName - The product name
 * @param category - Optional product category
 * @returns Text description for image search
 */
export async function generateImageDescription(
  productName: string,
  category?: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const categoryContext = category ? ` in the ${category} category` : '';
  const prompt = `Generate a concise product photo description for: ${productName}${categoryContext}. Description should be suitable for searching stock photos. Keep it under 50 words.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `OpenAI API error: ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from OpenAI');
    }

    return data.choices[0].message.content.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to generate image description');
  }
}
