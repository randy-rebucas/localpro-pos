import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '@/lib/logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs info messages to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test message');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('test message');
  });

  it('logs error messages to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('something broke', new Error('oops'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('something broke');
  });

  it('logs warn messages to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('watch out');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('watch out');
  });

  it('includes metadata in output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('with meta', { userId: '123', action: 'login' });
    expect(spy.mock.calls[0][0]).toContain('123');
  });

  it('handles error objects safely', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('db error', new TypeError('cannot read property'));
    const output = spy.mock.calls[0][0];
    expect(output).toContain('db error');
    expect(output).toContain('TypeError');
  });

  it('handles non-Error error values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('string error', 'just a string');
    expect(spy.mock.calls[0][0]).toContain('just a string');
  });
});
