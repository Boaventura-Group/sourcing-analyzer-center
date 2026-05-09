import { handleHealthCheck } from './routes/health';

export type Env = Record<string, never>;

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return handleHealthCheck();
    }

    return Response.json(
      { error: 'not_found' },
      {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  },
} satisfies ExportedHandler<Env>;
