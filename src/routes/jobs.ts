import { ZodError } from 'zod';
import {
  createD1Job,
  getD1JobResults,
  getD1JobStatus,
} from '../jobs/d1JobStore';
import { parseCsvCreateJobRequest } from '../input/parseCsv';
import { SupplierInputValidationError } from '../input/normalizeSupplierItems';
import { createJobRequestSchema } from '../jobs/types';
import type { CreateJobRequest } from '../jobs/types';
import { enqueueJob } from '../jobs/jobQueue';
import type { JobQueueMessage } from '../jobs/jobQueue';
import { jsonError, jsonResponse, validationError } from '../utils/http';
import {
  emitLogEvent,
  emitMetric,
  getErrorCode,
  getErrorMessage,
  sanitizeError,
} from '../utils/observability';

export type RequestContext = {
  traceId?: string;
};

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ZodError([
      {
        code: 'custom',
        path: [],
        message: 'Request body must be valid JSON',
      },
    ]);
  }
}

function isCsvContentType(request: Request): boolean {
  return request.headers.get('content-type')?.toLowerCase().includes('text/csv') ?? false;
}

function isExplicitCsvPayload(payload: unknown): payload is { csv: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'csv' in payload &&
    typeof (payload as { csv?: unknown }).csv === 'string'
  );
}

async function parseCreateJobRequest(request: Request): Promise<CreateJobRequest> {
  if (isCsvContentType(request)) {
    const csv = await request.text();
    return createJobRequestSchema.parse(parseCsvCreateJobRequest(csv));
  }

  const payload = await parseJson(request);

  if (isExplicitCsvPayload(payload)) {
    return createJobRequestSchema.parse(parseCsvCreateJobRequest(payload.csv));
  }

  return createJobRequestSchema.parse(payload);
}

export async function handleCreateJob(
  request: Request,
  db: D1Database,
  queue: Queue<JobQueueMessage>,
  context: RequestContext = {},
): Promise<Response> {
  try {
    const createJobRequest = await parseCreateJobRequest(request);
    const response = await createD1Job(db, createJobRequest);
    emitLogEvent('job_created', {
      stage: 'job_create',
      traceId: context.traceId,
      jobId: response.jobId,
      status: response.status,
      itemCount: response.itemCount,
    });
    emitMetric({
      name: 'jobs_created',
      value: 1,
      dimensions: { route: 'POST /jobs' },
      traceId: context.traceId,
      jobId: response.jobId,
    });

    try {
      await enqueueJob(queue, response.jobId);
    } catch (error) {
      emitLogEvent('job_enqueue_failed', {
        stage: 'job_create',
        traceId: context.traceId,
        jobId: response.jobId,
        status: response.status,
        itemCount: response.itemCount,
        errorCode: 'job_enqueue_failed',
        errorMessage: getErrorMessage(error, 'Job enqueue failed'),
        error: sanitizeError(error),
      }, 'error');
      emitMetric({
        name: 'job_enqueue_failed',
        value: 1,
        dimensions: { route: 'POST /jobs' },
        traceId: context.traceId,
        jobId: response.jobId,
      });
      return jsonError(
        'job_enqueue_failed',
        'Job was created but could not be queued for processing',
        503,
        response,
      );
    }

    return jsonResponse(response, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error.issues);
    }

    if (error instanceof SupplierInputValidationError) {
      return validationError(error.issues);
    }

    emitLogEvent('http_request_failed', {
      stage: 'job_create',
      traceId: context.traceId,
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error),
      error: sanitizeError(error),
    }, 'error');

    return jsonError('internal_error', 'Unexpected error', 500);
  }
}

export async function handleGetJobStatus(
  jobId: string,
  db: D1Database,
  context: RequestContext = {},
): Promise<Response> {
  try {
    const response = await getD1JobStatus(db, jobId);

    if (!response) {
      return jsonError('not_found', 'Job not found', 404);
    }

    return jsonResponse(response);
  } catch (error) {
    emitLogEvent('http_request_failed', {
      stage: 'job_status',
      traceId: context.traceId,
      jobId,
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error),
      error: sanitizeError(error),
    }, 'error');
    return jsonError('internal_error', 'Unexpected error', 500);
  }
}

export async function handleGetJobResults(
  jobId: string,
  db: D1Database,
  context: RequestContext = {},
): Promise<Response> {
  try {
    const response = await getD1JobResults(db, jobId);

    if (!response) {
      return jsonError('not_found', 'Job not found', 404);
    }

    return jsonResponse(response);
  } catch (error) {
    emitLogEvent('http_request_failed', {
      stage: 'job_results',
      traceId: context.traceId,
      jobId,
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error),
      error: sanitizeError(error),
    }, 'error');
    return jsonError('internal_error', 'Unexpected error', 500);
  }
}
