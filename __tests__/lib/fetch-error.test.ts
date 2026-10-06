import { describe, it, expect } from 'vitest';
import { getFetchErrorMessage, isAbortError, FETCH_TIMEOUT_MESSAGE } from '@/lib/fetch-error';

describe('getFetchErrorMessage', () => {
  it('reports an AbortController timeout as a readable timeout message', () => {
    const controller = new AbortController();
    controller.abort();
    let caught: unknown;
    try {
      controller.signal.throwIfAborted();
    } catch (err) {
      caught = err;
    }
    expect(isAbortError(caught)).toBe(true);
    expect(getFetchErrorMessage(caught, 'Failed')).toBe(FETCH_TIMEOUT_MESSAGE);
  });

  it('treats TimeoutError (AbortSignal.timeout) the same way', () => {
    expect(getFetchErrorMessage(new DOMException('timed out', 'TimeoutError'), 'Failed')).toBe(FETCH_TIMEOUT_MESSAGE);
  });

  it('passes ordinary error messages through', () => {
    expect(getFetchErrorMessage(new Error('Network down'), 'Failed')).toBe('Network down');
  });

  it('falls back for non-errors and empty messages', () => {
    expect(getFetchErrorMessage('boom', 'Failed')).toBe('Failed');
    expect(getFetchErrorMessage(new Error(''), 'Failed')).toBe('Failed');
    expect(isAbortError(null)).toBe(false);
  });
});
