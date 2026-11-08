/**
 * Email notification templates are stored as a single string:
 * "subject|body", or just "body" when there is no subject.
 *
 * Readers used to `split('|')` and take [0]/[1], which truncated any body that
 * itself contained a "|" ("Call us | Visit us" became "Call us "). Split on the
 * FIRST pipe only. Subjects can't contain "|" (rejected on save), and a body
 * containing "|" is always stored with a (possibly empty) subject prefix, so
 * the first pipe is always the separator.
 */
export function parseEmailTemplate(stored: string | undefined | null): { subject: string | null; body: string } {
  if (!stored) return { subject: null, body: '' };
  const i = stored.indexOf('|');
  if (i === -1) return { subject: null, body: stored };
  const subject = stored.slice(0, i);
  return { subject: subject || null, body: stored.slice(i + 1) };
}

/** Inverse of parseEmailTemplate. */
export function formatEmailTemplate(subject: string | undefined | null, body: string): string {
  const s = subject?.trim() ?? '';
  // Prefix even an empty subject when the body has a pipe, so it parses back intact.
  return s || body.includes('|') ? `${s}|${body}` : body;
}
