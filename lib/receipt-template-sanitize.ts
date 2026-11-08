import DOMPurify from 'dompurify';

/**
 * Receipt templates are tenant-authored HTML (any receipt_templates.manage
 * holder can write one) rendered in other staff members' sessions — the print
 * iframe is same-origin, so unsanitized markup there runs as the cashier or
 * owner. Everything rendered from a template goes through this.
 *
 * Keeps what receipts use (layout tags, tables, images, inline and <style>
 * CSS); drops scripts, event handlers, javascript: URLs, forms, frames and
 * embeds.
 */
export function sanitizeReceiptHtml(html: string, options: { wholeDocument?: boolean } = {}): string {
  // DOMPurify needs a DOM. Templates only render in the browser; on the
  // server there is nothing to protect, so return an empty string rather
  // than unsanitized markup.
  if (typeof window === 'undefined') return '';

  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: options.wholeDocument ?? true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'iframe', 'frame', 'object', 'embed', 'base', 'link', 'meta'],
    FORBID_ATTR: ['action', 'formaction'],
  });
}

export { escapeHtml } from '@/lib/html-escape';

/**
 * Save-time check so authors get a clear error instead of a template that
 * silently loses parts when sanitized at render time. Not the security
 * boundary — rendering always sanitizes.
 */
export function findUnsafeTemplateMarkup(input: string): string | null {
  // The old default template shipped a logo fallback of exactly this form, and
  // tenants have copied it into their own templates. It's harmless (stripped at
  // render; the print path hides broken images itself), so don't block saves on it.
  const html = input.replace(/\sonerror\s*=\s*(["'])this\.remove\(\)\1/gi, '');
  if (/<\s*script\b/i.test(html)) return '<script> tags are not allowed';
  if (/<\s*(iframe|object|embed|form|base|meta|link)\b/i.test(html)) return 'Embedded frames, forms and <link>/<meta>/<base> tags are not allowed';
  if (/\son[a-z]+\s*=/i.test(html)) return 'Event handler attributes (onclick, onerror, ...) are not allowed';
  if (/javascript\s*:/i.test(html)) return 'javascript: URLs are not allowed';
  return null;
}
