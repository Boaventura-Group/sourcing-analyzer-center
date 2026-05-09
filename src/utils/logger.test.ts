import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, sanitizeLogPayload } from './logger';

describe('sanitizeLogPayload', () => {
  it('preserves Error fields while sanitizing nested cause values', () => {
    const cause = new Error('token expired');
    const error = new Error('failed to create job', { cause });

    const sanitized = sanitizeLogPayload(error);

    expect(sanitized).toMatchObject({
      name: 'Error',
      message: 'failed to create job',
      cause: {
        name: 'Error',
        message: 'token expired',
      },
    });
    expect(sanitized).toHaveProperty('stack');
  });

  it('preserves Error fields inside structured payloads', () => {
    const error = new Error('request failed');
    error.stack = 'Error: request failed\n    at test';

    expect(
      sanitizeLogPayload({
        error,
        Authorization: 'Bearer secret-token',
      }),
    ).toEqual({
      error: {
        name: 'Error',
        message: 'request failed',
        stack: 'Error: request failed\n    at test',
      },
      Authorization: '[REDACTED]',
    });
  });

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
