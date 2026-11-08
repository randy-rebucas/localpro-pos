/**
 * HTML-escape a value for insertion into markup built as a string (print
 * windows, receipt templates). Safe in text and quoted-attribute contexts.
 * Braces are encoded too, so a value containing "{{total}}" can't be picked
 * up by a later template substitution pass.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}
