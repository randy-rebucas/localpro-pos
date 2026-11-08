/**
 * Content checks for uploads. The browser-supplied MIME type is just a claim;
 * these verify the bytes match it, so e.g. an HTML file cannot be stored and
 * served as "image/png".
 */


const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/**
 * The browser-supplied `file.type` is just a claim. Check the content matches
 * it, so e.g. an HTML file can't be stored and served as "image/png".
 */
export function contentMatchesType(buf: Buffer, type: string): boolean {
  switch (type) {
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif':
      return startsWith(buf, [0x47, 0x49, 0x46, 0x38]); // GIF8
    case 'image/webp':
      return startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8); // RIFF....WEBP
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return startsWith(buf, [0x00, 0x00, 0x01, 0x00]);
    case 'application/pdf':
      return startsWith(buf, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]); // zip container
    case 'application/vnd.ms-excel':
      // Legacy .xls is an OLE container; some apps label CSV as ms-excel too
      return startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0]) || isPlainText(buf);
    case 'text/csv':
      return isPlainText(buf);
    default:
      return false;
  }
}

export function isPlainText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  if (sample.includes(0)) return false; // binary
  return !/<\s*(html|script|svg|!doctype)/i.test(sample.toString('utf8'));
}
