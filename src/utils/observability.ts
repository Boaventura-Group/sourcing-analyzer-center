import { logger, sanitizeLogPayload } from './logger';

export type ObservabilityEvent =
  | 'http_request_started'
  | 'http_request_completed'
  | 'http_request_failed'
  | 'job_created'
  | 'job_enqueue_failed'
  | 'job_processing_started'
  | 'job_item_processed'
  | 'job_item_failed'
  | 'job_processing_completed'
  | 'job_processing_ignored'
  | 'job_processing_retryable_error'
  | 'metric_event';

type LogLevel = 'info' | 'warn' | 'error';

export type ObservabilityPayload = {
  event?: ObservabilityEvent;
  stage: string;
  jobId?: string | undefined;
  jobItemId?: string | undefined;
  asin?: string | undefined;
  status?: string | number | undefined;
  durationMs?: number | undefined;
  processedItems?: number | undefined;
  profitableItems?: number | undefined;
  errorItems?: number | undefined;
  schemaVersion?: number | undefined;
  requestId?: string | undefined;
  traceId?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  [key: string]: unknown;
};

export type MetricInput = {
  name: string;
  value: number;
  dimensions?: Record<string, unknown> | undefined;
  traceId?: string | undefined;
  jobId?: string | undefined;
  jobItemId?: string | undefined;
  asin?: string | undefined;
};

export function getRequestTraceId(request: Request): string {
  const cfRay = request.headers.get('cf-ray')?.trim();

  if (cfRay) {
    return cfRay;
  }

  return `trace_${crypto.randomUUID()}`;
}

export function sanitizeError(error: unknown): unknown {
  return sanitizeLogPayload(error);
}

export function getErrorCode(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) {
    return error.name;
  }

  return 'Error';
}

export function getErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    const sanitized = sanitizeLogPayload(error.message);
    return typeof sanitized === 'string' ? sanitized : fallback;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    const sanitized = sanitizeLogPayload(error);
    return typeof sanitized === 'string' ? sanitized : fallback;
  }

  return fallback;
}

export function durationMsSince(startedAtMs: number): number {
  return Math.max(0, Math.round(Date.now() - startedAtMs));
}

export function emitLogEvent(
  event: ObservabilityEvent,
  payload: ObservabilityPayload,
  level: LogLevel = 'info',
): void {
  logger[level](event, {
    event,
    ...payload,
  });
}

export function emitMetric(input: MetricInput): void {
  const payload: ObservabilityPayload = {
    event: 'metric_event',
    stage: 'metric',
    metricName: input.name,
    metricValue: input.value,
  };

  if (input.dimensions !== undefined) {
    payload.dimensions = input.dimensions;
  }

  if (input.traceId !== undefined) {
    payload.traceId = input.traceId;
  }

  if (input.jobId !== undefined) {
    payload.jobId = input.jobId;
  }

  if (input.jobItemId !== undefined) {
    payload.jobItemId = input.jobItemId;
  }

  if (input.asin !== undefined) {
    payload.asin = input.asin;
  }

  emitLogEvent('metric_event', payload);
}
