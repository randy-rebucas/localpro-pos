/**
 * Driver-neutral database errors. Repositories translate driver errors into
 * these so routes never check Mongo's 11000 or Postgres' 23505 directly.
 */

/** A unique index / unique constraint rejected the write. */
export class DuplicateKeyError extends Error {
  readonly cause?: unknown;
  /** The first field of the violated unique index, when the driver reports it. */
  readonly field?: string;

  constructor(message = 'Duplicate key', cause?: unknown) {
    super(message);
    this.name = 'DuplicateKeyError';
    this.cause = cause;
    this.field = duplicateField(cause);
  }
}

const TENANT_KEYS = new Set(['tenantId', 'tenant_id']);

/**
 * Mongo reports `keyPattern: { tenantId: 1, sku: 1 }`; Postgres reports
 * `detail: 'Key (tenant_id, sku)=(…) already exists.'`. Tenant-scoped unique
 * indexes lead with the tenant id, so that key is skipped.
 */
function duplicateField(err: unknown): string | undefined {
  const e = err as { keyPattern?: Record<string, unknown>; detail?: string; cause?: { detail?: string } } | null;
  let keys = Object.keys(e?.keyPattern ?? {});
  if (keys.length === 0) {
    const detail = e?.detail ?? e?.cause?.detail;
    keys = detail?.match(/Key \(([^)]+)\)/)?.[1].split(',').map((k) => k.trim()) ?? [];
  }
  return keys.find((k) => !TENANT_KEYS.has(k)) ?? keys[0];
}

function driverCode(err: unknown): unknown {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code ?? e?.cause?.code;
}

/**
 * True for a DuplicateKeyError, a raw Mongo duplicate-key error (11000) or a
 * raw Postgres unique violation (23505). Accepting the raw codes lets call
 * sites switch to this check before every write goes through a repository.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  if (err instanceof DuplicateKeyError) return true;
  const code = driverCode(err);
  return code === 11000 || code === '23505';
}

/** Wraps a raw duplicate-key error; any other error is returned unchanged. */
export function toDbError(err: unknown): unknown {
  if (isDuplicateKeyError(err) && !(err instanceof DuplicateKeyError)) {
    return new DuplicateKeyError((err as Error).message, err);
  }
  return err;
}
