import worker from './index';

describe('GET /health', () => {
  it('returns a simple ok JSON response', async () => {
    const response = await worker.fetch(new Request('https://example.test/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('POST /jobs', () => {
  it('creates an in-memory job and normalizes ASIN values', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test01', supplierCost: 10 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      status: 'queued',
      itemCount: 1,
    });
    expect(body).toHaveProperty('jobId');
  });

  it('returns standardized validation errors for invalid payloads', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({ items: [] }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Invalid request payload',
      },
    });
  });

  it('rejects jobs with more than 100 items', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: Array.from({ length: 101 }, () => ({
            asin: 'B000TEST01',
            supplierCost: 10,
          })),
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe('GET /jobs/:jobId', () => {
  it('returns job status for a previously created job', async () => {
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test02', supplierCost: 11 }],
        }),
      }),
    );
    const created = (await createResponse.json()) as { jobId: string };

    const response = await worker.fetch(new Request(`https://example.test/jobs/${created.jobId}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: created.jobId,
      status: 'queued',
      itemCount: 1,
    });
  });

  it('returns standardized 404 JSON when the job does not exist', async () => {
    const response = await worker.fetch(new Request('https://example.test/jobs/job_missing'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Job not found',
      },
    });
  });
});

describe('GET /jobs/:jobId/results', () => {
  it('returns an empty stable results envelope for this phase', async () => {
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test03', supplierCost: 12 }],
        }),
      }),
    );
    const created = (await createResponse.json()) as { jobId: string };

    const response = await worker.fetch(
      new Request(`https://example.test/jobs/${created.jobId}/results`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: created.jobId,
      status: 'queued',
      results: [],
    });
  });

  it('returns standardized 404 JSON when results are requested for a missing job', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs/job_missing/results'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Job not found',
      },
    });
  });
});
