import { ObjectId } from 'bson';

/** A new row id: the same 24-hex format in both drivers (docs/postgres-migration.md). */
export function newId(): string {
  return new ObjectId().toHexString();
}

/** True when `value` can be used as a row id. */
export function isValidId(value: string): boolean {
  return ObjectId.isValid(value);
}
