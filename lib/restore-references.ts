/**
 * Reference checks for restoring a backup file.
 *
 * A backup file can be edited by hand, so a record may point at an id that is not
 * in the file and not in this store (another store's product, a made-up user).
 * Such a record is skipped. Skipping one record can break others that point at it,
 * so the check repeats until nothing more is dropped.
 */

/** Limits for one restore request. */
export const MAX_RESTORE_BYTES = 25 * 1024 * 1024;
export const MAX_RESTORE_RECORDS = 50_000;
export const MAX_RESTORE_RECORDS_PER_COLLECTION = 25_000;

/** Reference fields whose names do not end in Id/Ids. */
const EXTRA_REF_KEYS = new Set(['product', 'voidedBy', 'processedBy', 'createdBy']);
/**
 * Fields that end in Id but are not checked: the record's own id, tenantId (always replaced
 * with this store), ids from outside systems, and prescriptionId (no Prescription model exists).
 */
const SKIP_KEYS = new Set([
  '_id', 'tenantId', 'prescriptionId',
  'scPwdId', 'terminalId', 'externalOrderId', 'shopifyFulfillmentId', 'shopifyCustomerId',
]);
/** Objects holding a payment provider's own ids (paymentDetails.transactionId is the gateway's id). */
const SKIP_PARENTS = new Set(['paymentDetails']);
const MAX_DEPTH = 6;

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

export function isReferenceKey(key: string): boolean {
  if (SKIP_KEYS.has(key)) return false;
  return EXTRA_REF_KEYS.has(key) || /Ids?$/.test(key);
}

/** Every id a record points at, found in reference fields at any depth (e.g. items[].product, branchStock[].branchId). */
export function collectReferences(doc: unknown): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    if (isObjectIdString(value)) out.add(value.toLowerCase());
    else if (Array.isArray(value)) value.forEach((v) => { if (isObjectIdString(v)) out.add(v.toLowerCase()); });
  };
  const walk = (node: unknown, depth: number) => {
    if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_PARENTS.has(key)) continue;
      if (isReferenceKey(key)) add(value);
      if (value && typeof value === 'object') walk(value, depth + 1);
    }
  };
  walk(doc, 0);
  return [...out];
}

/** The record's own id, lower-cased, if it has a valid one. */
export function ownId(doc: unknown): string | null {
  const id = (doc as { _id?: unknown } | null)?._id;
  return isObjectIdString(id) ? id.toLowerCase() : null;
}

type Docs = Record<string, unknown[]>;

/** Ids referenced by the records that are neither in the file nor in `alsoKnown`; the caller looks these up in the store. */
export function unresolvedReferences(collections: Docs, alsoKnown: Iterable<string> = []): string[] {
  const inFile = new Set<string>(alsoKnown);
  for (const docs of Object.values(collections)) for (const d of docs) { const id = ownId(d); if (id) inFile.add(id); }
  const missing = new Set<string>();
  for (const docs of Object.values(collections)) {
    for (const d of docs) for (const ref of collectReferences(d)) if (!inFile.has(ref)) missing.add(ref);
  }
  return [...missing];
}

/**
 * Keep the records whose every reference is in the kept records or in `existing`
 * (ids already in this store). Returns the kept records and how many were dropped per collection.
 */
export function filterByReferences(collections: Docs, existing: Iterable<string>): { kept: Docs; badReference: Record<string, number> } {
  const known = new Set<string>([...existing].map((id) => id.toLowerCase()));
  const refs = new Map<unknown, string[]>();
  for (const docs of Object.values(collections)) for (const d of docs) refs.set(d, collectReferences(d));

  let kept: Docs = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, [...v]]));
  for (;;) {
    const available = new Set(known);
    for (const docs of Object.values(kept)) for (const d of docs) { const id = ownId(d); if (id) available.add(id); }
    let dropped = 0;
    const next: Docs = {};
    for (const [name, docs] of Object.entries(kept)) {
      next[name] = docs.filter((d) => {
        const ok = (refs.get(d) ?? []).every((r) => available.has(r));
        if (!ok) dropped++;
        return ok;
      });
    }
    kept = next;
    if (dropped === 0) break;
  }

  const badReference: Record<string, number> = {};
  for (const [name, docs] of Object.entries(collections)) badReference[name] = docs.length - kept[name].length;
  return { kept, badReference };
}

/** Problems with the size of a backup file, before anything is written. */
export function checkRestoreSize(collections: Docs): { code: 'too_many_records'; collection?: string } | null {
  let total = 0;
  for (const [name, docs] of Object.entries(collections)) {
    if (docs.length > MAX_RESTORE_RECORDS_PER_COLLECTION) return { code: 'too_many_records', collection: name };
    total += docs.length;
  }
  return total > MAX_RESTORE_RECORDS ? { code: 'too_many_records' } : null;
}
