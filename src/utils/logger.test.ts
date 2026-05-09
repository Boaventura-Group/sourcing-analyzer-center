import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, sanitizeLogPayload } from './logger';

describe('sanitizeLogPayload', () => {
  it('redacts known secret fields without changing safe fields', () => {
    expect(
      sanitizeLogPayload({
        asin: 'B000TEST01',
        Authorization: 'Bearer secret-token',
        nested: {
          KEEPA_API_KEY: 'keepa-secret',
          status: 'ok',
        },
      }),
    ).toEqual({
      asin: 'B000TEST01',
      Authorization: '[REDACTED]',
      nested: {
        KEEPA_API_KEY: '[REDACTED]',
        status: 'ok',
      },
    });
  });

  it('returns Circular when a circular object reference is detected', () => {
    const payload: { status: string; self?: unknown } = { status: 'ok' };
    payload.self = payload;

    expect(sanitizeLogPayload(payload)).toEqual({
      status: 'ok',
      self: '[Circular]',
    });
  });

  it('sanitizes arrays and returns Circular for circular array references', () => {
    const payload: unknown[] = [{ Authorization: 'Bearer secret-token' }];
    payload.push(payload);

    expect(sanitizeLogPayload(payload)).toEqual([
      { Authorization: '[REDACTED]' },
      '[Circular]',
    ]);
  });
});

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes sanitized structured logs', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('healthcheck', {
      status: 'ok',
      AMAZON_REFRESH_TOKEN: 'refresh-secret',
    });

    expect(info).toHaveBeenCalledWith('healthcheck', {
      status: 'ok',
      AMAZON_REFRESH_TOKEN: '[REDACTED]',
    });
  });
});
