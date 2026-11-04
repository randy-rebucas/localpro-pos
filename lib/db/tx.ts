import type mongoose from 'mongoose';
import { runWithOptionalMongoTransaction } from '@/lib/mongo-session';

/**
 * A transaction handle passed to repository methods. Opaque to callers: they
 * get one from runInTransaction() and hand it back to the repositories.
 * The Postgres variant is added in Phase 4.
 */
export interface DbTx {
  readonly driver: 'mongo';
  /** Undefined on standalone Mongo (dev), where transactions are unsupported. */
  readonly session?: mongoose.ClientSession;
}

/**
 * Runs `fn` in a transaction. On Mongo this keeps runWithOptionalMongoTransaction's
 * behavior: retries on TransientTransactionError and falls back to no
 * transaction on standalone servers.
 */
export function runInTransaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return runWithOptionalMongoTransaction((session) => fn({ driver: 'mongo', session }));
}

/**
 * False when `runInTransaction` fell back to running without a transaction
 * (standalone Mongo), so writes already made stay applied after a failure.
 */
export function isTransactional(tx: DbTx): boolean {
  return tx.session !== undefined;
}

/**
 * Wraps an existing Mongo session, for routes that still open their own
 * session while only some of their models have moved to repositories.
 */
export function mongoTx(session: mongoose.ClientSession | undefined): DbTx {
  return { driver: 'mongo', session };
}
