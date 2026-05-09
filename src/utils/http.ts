import type { ZodIssue } from 'zod';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

type JsonErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: JSON_HEADERS,
  });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: JsonErrorBody = {
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    body.error.details = details;
  }

  return jsonResponse(body, status);
}

export function validationError(issues: ZodIssue[]): Response {
  return jsonError('validation_error', 'Invalid request payload', 400, issues);
}
