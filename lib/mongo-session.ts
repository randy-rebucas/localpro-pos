import mongoose from 'mongoose';

const TX_UNSUPPORTED_PATTERNS = [
  'replica set',
  'mongos',
  'transaction numbers are only allowed',
];

export function isMongoTransactionUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return TX_UNSUPPORTED_PATTERNS.some((p) => lower.includes(p));
}

export function sessionOpts(session?: mongoose.ClientSession) {
  return session ? { session } : {};
}

export function withOptionalSession<T extends { session: (s: mongoose.ClientSession) => T }>(
  query: T,
  session?: mongoose.ClientSession
): T {
  return session ? query.session(session) : query;
}

function hasErrorLabel(error: unknown, label: string): boolean {
  const err = error as { errorLabels?: string[]; errorLabelSet?: Set<string> } | null;
  if (!err) return false;
  if (Array.isArray(err.errorLabels) && err.errorLabels.includes(label)) return true;
  if (err.errorLabelSet instanceof Set && err.errorLabelSet.has(label)) return true;
  return false;
}

/** Retryable per MongoDB's documented transaction retry pattern. */
function isTransientTransactionError(error: unknown): boolean {
  return hasErrorLabel(error, 'TransientTransactionError');
}

const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * Runs writes inside a MongoDB transaction when supported.
 * Falls back to non-transactional execution on standalone/dev databases.
 *
 * Retries the whole callback on TransientTransactionError (e.g. a write
 * conflict from two concurrent checkouts touching the same product's stock)
 * per MongoDB's documented transaction retry pattern — without this, a
 * legitimate concurrent conflict surfaces as a raw 500 instead of resolving
 * on its own.
 */
export async function runWithOptionalMongoTransaction<T>(
  run: (session: mongoose.ClientSession | undefined) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
    const session = await mongoose.startSession();
    let started = false;

    try {
      session.startTransaction();
      started = true;
      const result = await run(session);
      await session.commitTransaction();
      session.endSession();
      return result;
    } catch (error) {
      if (started) {
        try {
          await session.abortTransaction();
        } catch {
          // No active transaction to abort
        }
      }
      session.endSession();

      if (isMongoTransactionUnsupported(error)) {
        return run(undefined);
      }
      if (isTransientTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }
  throw new Error('runWithOptionalMongoTransaction: exhausted retry attempts');
}
