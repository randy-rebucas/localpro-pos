import fs from 'fs';
import readline from 'readline';
import path from 'path';
import prisma from '../../../lib/prisma';

const EXPORTS_DIR = path.join(process.cwd(), 'scripts', 'migrations', 'exports');

export async function loadCollection<T = Record<string, unknown>>(name: string): Promise<T[]> {
  const filePath = path.join(EXPORTS_DIR, `${name}.ndjson`);
  if (!fs.existsSync(filePath)) return [];
  const docs: T[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    docs.push(JSON.parse(line));
  }
  return docs;
}

/** Preloads the entire _migration_id_map table into memory for O(1) lookups. */
export async function loadIdMap(): Promise<Map<string, string>> {
  const rows = await prisma.migrationIdMap.findMany();
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(`${row.collection}:${row.mongoId}`, row.uuid);
  }
  return map;
}

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function extractOid(value: unknown): string | null {
  if (typeof value === 'string' && OBJECT_ID_RE.test(value)) return value;
  if (value && typeof value === 'object' && '$oid' in (value as Record<string, unknown>)) {
    const oid = (value as Record<string, unknown>).$oid;
    if (typeof oid === 'string' && OBJECT_ID_RE.test(oid)) return oid;
  }
  return null;
}

/** Resolves a Mongo ObjectId (in the given collection's id space) to its migrated UUID. Returns null for null/undefined/empty input. */
export function resolveId(idMap: Map<string, string>, collection: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const oid = extractOid(value);
  if (!oid) return null;
  const uuid = idMap.get(`${collection}:${oid}`);
  if (!uuid) {
    throw new Error(`No id-map entry for ${collection}:${oid} — run 02-id-map.ts against a fresh export first`);
  }
  return uuid;
}

/** Same as resolveId but returns null instead of throwing when the mapping is missing (for optional/best-effort refs). */
export function resolveIdOrNull(idMap: Map<string, string>, collection: string, value: unknown): string | null {
  try {
    return resolveId(idMap, collection, value);
  } catch {
    return null;
  }
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

export function toDateRequired(value: unknown, fallback = new Date()): Date {
  return toDate(value) ?? fallback;
}

/** Empty string -> null; otherwise pass through. Normalizes the billingHistory.transactionId: "" pattern found in production data. */
export function emptyToNull<T>(value: T): T | null {
  return value === '' ? null : value;
}

export function num(value: unknown, fallback: number | null = null): number | null {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}
