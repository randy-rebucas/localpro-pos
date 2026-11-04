import type { ClientSession, HydratedDocument } from 'mongoose';
import connectDB from '@/lib/mongodb';
import { toDbError } from '../errors';
import type { DbTx } from '../tx';
import type { UpdateResult } from '../types';
import { toApi } from './serialize';

/**
 * Runs a repository operation: connects (cached after the first call) and
 * translates driver errors (duplicate key → DuplicateKeyError).
 */
export async function run<T>(op: () => Promise<T>): Promise<T> {
  await connectDB();
  try {
    return await op();
  } catch (err) {
    throw toDbError(err);
  }
}

export function sessionOf(tx?: DbTx): ClientSession | undefined {
  return tx?.session;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Copies only the keys that are set (drops undefined), like a $set built by hand. */
export function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Turns a Patch into `{ $set, $unset }`: undefined keys are skipped, `null`
 * unsets. Either operator is left out when empty.
 */
export function toSetUnset(patch: object): { $set?: Record<string, unknown>; $unset?: Record<string, 1> } {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) $unset[key] = 1;
    else $set[key] = value;
  }
  return {
    ...(Object.keys($set).length && { $set }),
    ...(Object.keys($unset).length && { $unset }),
  };
}

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies a Patch to a loaded document and saves it, so Mongoose setters
 * (trim, uppercase) and validators run exactly as with `doc.x = ...; save()`.
 * `null` clears a field. Skips the write when nothing changed.
 */
export async function applyPatch<T>(
  doc: HydratedDocument<unknown>,
  patch: object,
  session?: ClientSession
): Promise<UpdateResult<T>> {
  const before = toApi<Record<string, unknown>>(doc);
  const keys: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    doc.set(key, value === null ? undefined : value);
    keys.push(key);
  }

  const current = toApi<Record<string, unknown>>(doc);
  const changed = keys.filter((k) => !sameValue(before[k], current[k]));
  if (changed.length > 0) {
    await doc.save({ session });
  }
  return { before: before as T, after: toApi<T>(doc), changed };
}
