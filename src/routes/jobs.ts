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
import { logger } from '../utils/logger';

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
): Promise<Response> {
  try {
    const createJobRequest = await parseCreateJobRequest(request);
    const response = await createD1Job(db, createJobRequest);

    try {
      await enqueueJob(queue, response.jobId);
    } catch (error) {
      logger.error('Job enqueue failed after persistence', {
        jobId: response.jobId,
        error,
      });
      return jsonError(
        'job_enqueue_failed',
        'Job was created but could not be queued for processing',
        503,
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

    logger.error('Job creation failed', { error });

    return jsonError('internal_error', 'Unexpected error', 500);
  }
}

export async function handleGetJobStatus(jobId: string, db: D1Database): Promise<Response> {
  try {
    const response = await getD1JobStatus(db, jobId);

    if (!response) {
      return jsonError('not_found', 'Job not found', 404);
    }

    return jsonResponse(response);
  } catch {
    return jsonError('internal_error', 'Unexpected error', 500);
  }
}

export async function handleGetJobResults(jobId: string, db: D1Database): Promise<Response> {
  try {
    const response = await getD1JobResults(db, jobId);

    if (!response) {
      return jsonError('not_found', 'Job not found', 404);
    }

    return jsonResponse(response);
  } catch {
    return jsonError('internal_error', 'Unexpected error', 500);
  }
}
