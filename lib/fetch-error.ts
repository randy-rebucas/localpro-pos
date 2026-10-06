/**
 * Turn a caught fetch error into a user-facing message.
 *
 * Client hooks abort their own requests via an AbortController timeout; the
 * browser then rejects with an AbortError whose message ("signal is aborted
 * without reason") means nothing to a user. Report it as a timeout instead.
 */
export const FETCH_TIMEOUT_MESSAGE = 'The server took too long to respond. Please try again.';

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    ((err as { name?: unknown }).name === 'AbortError' || (err as { name?: unknown }).name === 'TimeoutError')
  );
}

export function getFetchErrorMessage(err: unknown, fallback: string): string {
  if (isAbortError(err)) return FETCH_TIMEOUT_MESSAGE;
  return err instanceof Error && err.message ? err.message : fallback;
}
