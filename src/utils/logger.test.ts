import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, sanitizeLogPayload } from './logger';

describe('sanitizeLogPayload', () => {
  it('redacts secrets from Error messages without logging stack by default', () => {
    const error = new Error(
      [
        'Amazon failed with Authorization: Bearer fake-access-token',
        'x-amz-access-token: fake-amz-access-token',
        'KEEPA_API_KEY=fake-keepa-key',
        'AMAZON_REFRESH_TOKEN=refresh-token',
        'AMAZON_LWA_CLIENT_SECRET=lwa-secret',
      ].join(' and '),
    );
    error.stack =
      'Error: token=stack-token\n    at request with AMAZON_REFRESH_TOKEN=refresh-token';

    expect(sanitizeLogPayload(error)).toEqual({
      name: 'Error',
      message:
        'Amazon failed with Authorization: Bearer [REDACTED] and x-amz-access-token: [REDACTED] and KEEPA_API_KEY=[REDACTED] and AMAZON_REFRESH_TOKEN=[REDACTED] and AMAZON_LWA_CLIENT_SECRET=[REDACTED]',
    });
  });

  it('redacts secrets from string causes and regular string payload values', () => {
    const error = new Error('request failed', {
      cause: 'upstream returned api_key=fake-api-key and secret=fake-secret',
    });

    expect(
      sanitizeLogPayload({
        error,
        detail: 'retry failed with Bearer fake-bearer-token and token=fake-token',
      }),
    ).toMatchObject({
      error: {
        name: 'Error',
        message: 'request failed',
        cause: 'upstream returned api_key=[REDACTED] and secret=[REDACTED]',
      },
      detail: 'retry failed with Bearer [REDACTED] and token=[REDACTED]',
    });
  });

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
    expect(sanitized).not.toHaveProperty('stack');
  });

  it('preserves safe Error fields inside structured payloads without stack', () => {
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
