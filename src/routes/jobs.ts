import { ZodError } from 'zod';
import {
  createInMemoryJob,
  getInMemoryJobResults,
  getInMemoryJobStatus,
} from '../jobs/jobStore';
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

export async function handleCreateJob(request: Request): Promise<Response> {
  try {
    const payload = await parseJson(request);
    const createJobRequest = createJobRequestSchema.parse(payload);
    const response = createInMemoryJob(createJobRequest);

    return jsonResponse(response, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error.issues);
    }

    return jsonError('internal_error', 'Unexpected error', 500);
  }
}

export function handleGetJobStatus(jobId: string): Response {
  const response = getInMemoryJobStatus(jobId);

  if (!response) {
    return jsonError('not_found', 'Job not found', 404);
  }

  return jsonResponse(response);
}

export function handleGetJobResults(jobId: string): Response {
  const response = getInMemoryJobResults(jobId);

  if (!response) {
    return jsonError('not_found', 'Job not found', 404);
  }

  return jsonResponse(response);
}
