import { createHash } from 'crypto';

// A fixed namespace UUID for this migration, so re-running id-mapping for the
// same (collection, mongoId) pair always produces the same UUID.
const MIGRATION_NAMESPACE = 'a3f1c9e2-4b8d-4e7a-9c1f-2d6b8e0a5f3c';

function parseUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** RFC 4122 UUIDv5 (SHA-1 based, deterministic) */
export function uuid5(name: string, namespace: string = MIGRATION_NAMESPACE): string {
  const hash = createHash('sha1')
    .update(parseUuid(namespace))
    .update(name)
    .digest();

  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
