/**
 * Anthropic Claude Integration
 * Provides utilities for AI-powered features like image description suggestions
 */

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

interface ClaudeResponse {
  content: ClaudeTextBlock[];
  stop_reason: string;
}

/**
 * Generate a detailed image description using Claude based on product name
 * @param productName - The product name to generate image description for
 * @param category - Optional product category for better context
 * @returns Detailed image description suitable for finding or generating images
 */
export async function generateImageDescription(
  productName: string,
  category?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured in environment variables');
  }

  if (!productName || productName.trim().length === 0) {
    throw new Error('Product name is required for image description generation');
  }

  const categoryContext = category ? ` in the ${category} category` : '';
  const prompt = `Generate a professional and detailed product image description for an e-commerce listing. 

Product Name: ${productName.trim()}${categoryContext}

Create a vivid, visual description that captures what a professional product photo should look like. Include:
- Setting and background (clean, simple, professional)
- Lighting (bright, natural, well-lit)
- Product positioning and angles
- Any styling or props that would enhance presentation
- Color palette and mood
- Photography style (e.g., flat lay, lifestyle, close-up)

Keep the description concise (2-3 sentences) and actionable for someone searching for or generating images.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as any).error?.message || `Claude API error: ${response.statusText}`; // eslint-disable-line @typescript-eslint/no-explicit-any
      throw new Error(errorMessage);
    }

    const data: ClaudeResponse = await response.json();

    if (!data.content || data.content.length === 0 || data.content[0].type !== 'text') {
      throw new Error('No text response from Claude');
    }

    return data.content[0].text.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to generate image description with Claude');
  }
}

/**
 * Generate multiple image style suggestions for a product
 * @param productName - The product name
 * @param category - Optional product category
 * @returns Array of image style suggestions
 */
export async function generateStyleSuggestions(
  productName: string,
  category?: string
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const categoryContext = category ? ` in the ${category} category` : '';
  const prompt = `For a product called "${productName}"${categoryContext}, suggest 3 different photography styles for product images. 

Return ONLY the 3 suggestions, one per line, without numbering or extra formatting. Examples:
- Minimalist white background flat lay
- Lifestyle shot with product in use context
- Close-up detail shot showing texture and quality

Keep each suggestion to one short line.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data: ClaudeResponse = await response.json();

    if (!data.content || data.content.length === 0 || data.content[0].type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const text = data.content[0].text.trim();
    return text
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to generate style suggestions');
  }
}
