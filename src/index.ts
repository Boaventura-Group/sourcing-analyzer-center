import { handleHealthCheck } from './routes/health';
import { handleCreateJob, handleGetJobResults, handleGetJobStatus } from './routes/jobs';
import { jsonError } from './utils/http';

export type Env = Record<string, never>;

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return handleHealthCheck();
    }

    if (request.method === 'POST' && url.pathname === '/jobs') {
      return handleCreateJob(request);
    }

    const jobPathMatch = /^\/jobs\/([^/]+)(?:\/(results))?$/.exec(url.pathname);

    if (jobPathMatch) {
      const jobId = decodeURIComponent(jobPathMatch[1] ?? '');
      const subResource = jobPathMatch[2];

      if (request.method === 'GET' && subResource === undefined) {
        return handleGetJobStatus(jobId);
      }

      if (request.method === 'GET' && subResource === 'results') {
        return handleGetJobResults(jobId);
      }
    }

    return jsonError('not_found', 'Route not found', 404);
  },
} satisfies ExportedHandler<Env>;
