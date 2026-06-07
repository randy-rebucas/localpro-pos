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

/**
 * Runs writes inside a MongoDB transaction when supported.
 * Falls back to non-transactional execution on standalone/dev databases.
 */
export async function runWithOptionalMongoTransaction<T>(
  run: (session: mongoose.ClientSession | undefined) => Promise<T>
): Promise<T> {
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
    throw error;
  }
}
