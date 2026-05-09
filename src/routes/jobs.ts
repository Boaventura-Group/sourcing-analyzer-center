import { ZodError } from 'zod';
import {
  createD1Job,
  getD1JobResults,
  getD1JobStatus,
} from '../jobs/d1JobStore';
import { createJobRequestSchema } from '../jobs/types';
import { jsonError, jsonResponse, validationError } from '../utils/http';

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

export async function handleCreateJob(request: Request, db: D1Database): Promise<Response> {
  try {
    const payload = await parseJson(request);
    const createJobRequest = createJobRequestSchema.parse(payload);
    const response = await createD1Job(db, createJobRequest);

    return jsonResponse(response, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error.issues);
    }

    return jsonError('internal_error', 'Unexpected error', 500);
  }
}

export async function handleGetJobStatus(jobId: string, db: D1Database): Promise<Response> {
  const response = await getD1JobStatus(db, jobId);

  if (!response) {
    return jsonError('not_found', 'Job not found', 404);
  }

  return jsonResponse(response);
}

export async function handleGetJobResults(jobId: string, db: D1Database): Promise<Response> {
  const response = await getD1JobResults(db, jobId);

  if (!response) {
    return jsonError('not_found', 'Job not found', 404);
  }

  return jsonResponse(response);
}
