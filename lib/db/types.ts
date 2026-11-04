/**
 * Shared repository types. Entity types describe the API shape the routes
 * return: `_id` and references are 24-hex strings, dates are Dates. Both the
 * Mongo and (Phase 4) Postgres implementations return exactly this shape.
 */

export type Id = string;

/** A reference that may come back populated (e.g. `managerId: { _id, name, email }`). */
export type Ref<T> = Id | (T & { _id: Id }) | null;

export interface UserSummary {
  _id: Id;
  name: string;
  email: string;
}

/**
 * Partial update: an `undefined` key is left alone, `null` clears the field.
 */
export type Patch<T> = { [K in keyof T]?: T[K] | null };

export interface UpdateResult<T> {
  before: T;
  after: T;
  /** Top-level fields whose value actually changed. Empty means nothing was written. */
  changed: string[];
}
