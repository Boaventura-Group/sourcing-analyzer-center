import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitLogEvent,
  emitMetric,
  getRequestTraceId,
  sanitizeError,
} from './observability';

describe('observability helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits structured events with consistent fields and sanitized payloads', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = new Error(
      'failed with Authorization: Bearer secret-token and AMAZON_LWA_CLIENT_SECRET=secret',
    );

    emitLogEvent('job_created', {
      stage: 'job_create',
      traceId: 'ray-test',
      jobId: 'job_1',
      Authorization: 'Bearer secret-token',
      'x-amz-access-token': 'amazon-access-token',
      KEEPA_API_KEY: 'keepa-secret',
      AMAZON_REFRESH_TOKEN: 'refresh-secret',
      AMAZON_LWA_CLIENT_SECRET: 'lwa-secret',
      error,
    });

    const payload = info.mock.calls[0]?.[1];
    const serialized = JSON.stringify(payload);

    expect(info).toHaveBeenCalledWith(
      'job_created',
      expect.objectContaining({
        event: 'job_created',
        stage: 'job_create',
        traceId: 'ray-test',
        jobId: 'job_1',
        Authorization: '[REDACTED]',
        'x-amz-access-token': '[REDACTED]',
        KEEPA_API_KEY: '[REDACTED]',
        AMAZON_REFRESH_TOKEN: '[REDACTED]',
        AMAZON_LWA_CLIENT_SECRET: '[REDACTED]',
      }),
    );
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('amazon-access-token');
    expect(serialized).not.toContain('keepa-secret');
    expect(serialized).not.toContain('refresh-secret');
    expect(serialized).not.toContain('lwa-secret');
    expect(serialized).not.toContain('stack');
  });

  it('serializes errors without leaking bearer tokens or sensitive causes', () => {
    const error = new Error('Bearer secret-bearer-token', {
      cause: {
        payload: {
          Authorization: 'Bearer nested-secret',
          KEEPA_API_KEY: 'keepa-secret',
        },
      },
    });

    const sanitized = sanitizeError(error);
    const serialized = JSON.stringify(sanitized);

    expect(sanitized).toMatchObject({
      name: 'Error',
      message: 'Bearer [REDACTED]',
      cause: {
        payload: '[REDACTED]',
      },
    });
    expect(serialized).not.toContain('secret-bearer-token');
    expect(serialized).not.toContain('nested-secret');
    expect(serialized).not.toContain('keepa-secret');
    expect(serialized).not.toContain('stack');
  });

  it('emits metrics as structured log events without secrets', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitMetric({
      name: 'jobs_created',
      value: 1,
      dimensions: {
        route: 'POST /jobs',
        KEEPA_API_KEY: 'keepa-secret',
      },
      traceId: 'ray-metric',
    });

    expect(info).toHaveBeenCalledWith(
      'metric_event',
      expect.objectContaining({
        event: 'metric_event',
        stage: 'metric',
        metricName: 'jobs_created',
        metricValue: 1,
        traceId: 'ray-metric',
        dimensions: {
          route: 'POST /jobs',
          KEEPA_API_KEY: '[REDACTED]',
        },
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('keepa-secret');
  });

  it('uses cf-ray as request trace id and generates a safe fallback', () => {
    const withCfRay = new Request('https://example.test/jobs', {
      headers: { 'cf-ray': 'abc123-LHR' },
    });
    const withoutCfRay = new Request('https://example.test/jobs');

    expect(getRequestTraceId(withCfRay)).toBe('abc123-LHR');
    expect(getRequestTraceId(withoutCfRay)).toMatch(/^trace_[0-9a-f-]{36}$/);
  });
});
