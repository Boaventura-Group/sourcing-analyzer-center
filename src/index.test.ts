import worker from './index';

describe('GET /health', () => {
  it('returns a simple ok JSON response', async () => {
    const response = await worker.fetch(new Request('https://example.test/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
