/**
 * Converts Mongoose documents and lean() results into the driver-neutral API
 * shape: ObjectIds become 24-hex strings, `__v` is dropped, Dates stay Dates.
 * JSON output is unchanged (ObjectIds already serialize as hex strings), so
 * routes return exactly what they returned before.
 */

function isObjectId(value: unknown): value is { toHexString(): string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _bsontype?: string })._bsontype === 'ObjectId'
  );
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isObjectId(value)) return value.toHexString();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === 'object') {
    // Mongoose Map paths come out of toObject() as JS Maps
    if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, convert(v)]));
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === '__v') continue;
      out[key] = convert(v);
    }
    return out;
  }
  return value;
}

type Hydrated = { toObject: (opts?: object) => unknown };

/** Serializes one document (hydrated or lean). */
export function toApi<T>(doc: unknown): T {
  const plain =
    doc && typeof (doc as Hydrated).toObject === 'function'
      ? (doc as Hydrated).toObject({ depopulate: false })
      : doc;
  return convert(plain) as T;
}

export function toApiOrNull<T>(doc: unknown): T | null {
  return doc ? toApi<T>(doc) : null;
}

export function toApiList<T>(docs: unknown[]): T[] {
  return docs.map((d) => toApi<T>(d));
}
