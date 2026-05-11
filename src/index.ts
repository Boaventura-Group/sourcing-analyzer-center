import { handleHealthCheck } from './routes/health';
import { handleCreateJob, handleGetJobResults, handleGetJobStatus } from './routes/jobs';
import { jsonError } from './utils/http';
import { processJobQueueMessage } from './jobs/processJob';
import { parseJobQueueMessage } from './jobs/jobQueue';
import type { JobQueueMessage } from './jobs/jobQueue';
import {
  durationMsSince,
  emitLogEvent,
  emitMetric,
  getErrorCode,
  getErrorMessage,
  getRequestTraceId,
  sanitizeError,
} from './utils/observability';

export type Env = {
  DB: D1Database;
  JOB_QUEUE: Queue<JobQueueMessage>;
  SAC_INTERNAL_TOKEN: string;
};

const INTERNAL_TOKEN_HEADER = 'x-sac-internal-token';

export default {
  async fetch(request, env): Promise<Response> {
    const startedAtMs = Date.now();
    const url = new URL(request.url);
    const traceId = getRequestTraceId(request);

    emitLogEvent('http_request_started', {
      stage: 'http',
      traceId,
      method: request.method,
      path: url.pathname,
    });

    try {
      const response = await routeRequest(request, env, url, traceId);
      const durationMs = durationMsSince(startedAtMs);

      if (response.status >= 500) {
        emitLogEvent('http_request_failed', {
          stage: 'http',
          traceId,
          method: request.method,
          path: url.pathname,
          status: response.status,
          durationMs,
          errorCode: `HTTP_${response.status}`,
          errorMessage: 'HTTP request failed',
        }, 'error');
      }

      emitLogEvent('http_request_completed', {
        stage: 'http',
        traceId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs,
      });

      return response;
    } catch (error) {
      emitLogEvent('http_request_failed', {
        stage: 'http',
        traceId,
        method: request.method,
        path: url.pathname,
        status: 500,
        durationMs: durationMsSince(startedAtMs),
        errorCode: getErrorCode(error),
        errorMessage: getErrorMessage(error),
        error: sanitizeError(error),
      }, 'error');

      return jsonError('internal_error', 'Unexpected error', 500);
    }
  },

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      const body = parseJobQueueMessage(message.body);

      if (!body) {
        // Malformed queue bodies are poison messages, so discard them with ack.
        emitLogEvent('job_processing_ignored', {
          stage: 'queue',
          reason: 'malformed_message',
          bodyType: typeof message.body,
        }, 'warn');
        emitMetric({
          name: 'jobs_ignored',
          value: 1,
          dimensions: { reason: 'malformed_message' },
        });
        message.ack();
        continue;
      }

      try {
        await processJobQueueMessage(env.DB, body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;

async function routeRequest(
  request: Request,
  env: Env,
  url: URL,
  traceId: string,
): Promise<Response> {
    if (request.method === 'GET' && url.pathname === '/health') {
      return handleHealthCheck();
    }

    if (request.method === 'POST' && url.pathname === '/jobs') {
      const authError = validateInternalAuth(request, env);
      if (authError) {
        return authError;
      }

      return handleCreateJob(request, env.DB, env.JOB_QUEUE, { traceId });
    }

    const jobPathMatch = /^\/jobs\/([^/]+)(?:\/(results))?$/.exec(url.pathname);

    if (jobPathMatch) {
      const authError = validateInternalAuth(request, env);
      if (authError) {
        return authError;
      }

      const jobId = decodeURIComponent(jobPathMatch[1] ?? '');
      const subResource = jobPathMatch[2];

      if (request.method === 'GET' && subResource === undefined) {
        return handleGetJobStatus(jobId, env.DB, { traceId });
      }

      if (request.method === 'GET' && subResource === 'results') {
        return handleGetJobResults(jobId, env.DB, { traceId });
      }
    }

    return jsonError('not_found', 'Route not found', 404);
}

function validateInternalAuth(request: Request, env: Env): Response | null {
  const configuredToken = env.SAC_INTERNAL_TOKEN;

  if (!configuredToken) {
    return jsonError('internal_auth_not_configured', 'Internal authentication is not configured', 500);
  }

  if (request.headers.get(INTERNAL_TOKEN_HEADER) !== configuredToken) {
    return jsonError('unauthorized', 'Unauthorized', 401);
  }

  return null;
}
