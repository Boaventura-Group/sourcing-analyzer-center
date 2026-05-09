import { handleHealthCheck } from './routes/health';
import { handleCreateJob, handleGetJobResults, handleGetJobStatus } from './routes/jobs';
import { jsonError } from './utils/http';
import { processJobQueueMessage } from './jobs/processJob';
import type { JobQueueMessage } from './jobs/jobQueue';
import { logger } from './utils/logger';

export type Env = {
  DB: D1Database;
  JOB_QUEUE: Queue<JobQueueMessage>;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return handleHealthCheck();
    }

    if (request.method === 'POST' && url.pathname === '/jobs') {
      return handleCreateJob(request, env.DB, env.JOB_QUEUE);
    }

    const jobPathMatch = /^\/jobs\/([^/]+)(?:\/(results))?$/.exec(url.pathname);

    if (jobPathMatch) {
      const jobId = decodeURIComponent(jobPathMatch[1] ?? '');
      const subResource = jobPathMatch[2];

      if (request.method === 'GET' && subResource === undefined) {
        return handleGetJobStatus(jobId, env.DB);
      }

      if (request.method === 'GET' && subResource === 'results') {
        return handleGetJobResults(jobId, env.DB);
      }
    }

    return jsonError('not_found', 'Route not found', 404);
  },

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as JobQueueMessage;

      try {
        await processJobQueueMessage(env.DB, body);
        message.ack();
      } catch (error) {
        logger.error('Job queue message processing failed', {
          jobId: body.jobId,
          schemaVersion: body.schemaVersion,
          error,
        });
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
