import worker from './index';
import type { Env } from './index';

type JobRecord = {
  id: string;
  status: string;
  total_items: number;
};

type JobItemRecord = {
  id: string;
  job_id: string;
  row_number: number;
  ean: string | null;
  asin: string;
  supplier_title: string | null;
  supplier_cost: number;
  spreadsheet_sales_price: number | null;
  status: string;
};

type ItemResultRecord = Record<string, unknown>;

type RunResult = { success: true };

class FakePreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakePreparedStatement {
    this.values = values;
    return this;
  }

  async run(): Promise<RunResult> {
    this.db.executeRun(this.sql, this.values);
    return { success: true };
  }

  async first<T>(): Promise<T | null> {
    return this.db.executeFirst<T>(this.sql, this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.executeAll<T>(this.sql, this.values) };
  }
}

class FakeD1Database {
  readonly jobs = new Map<string, JobRecord>();
  readonly jobItems: JobItemRecord[] = [];
  readonly itemResults: ItemResultRecord[] = [];
  failNextAll = false;
  failNextFirst = false;

  prepare(sql: string): FakePreparedStatement {
    return new FakePreparedStatement(this, sql);
  }

  async batch(statements: FakePreparedStatement[]): Promise<RunResult[]> {
    const results: RunResult[] = [];

    for (const statement of statements) {
      results.push(await statement.run());
    }

    return results;
  }

  executeRun(sql: string, values: unknown[]): void {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    if (normalizedSql.startsWith('INSERT INTO jobs')) {
      const [id, status, totalItems] = values;
      this.jobs.set(String(id), {
        id: String(id),
        status: String(status),
        total_items: Number(totalItems),
      });
      return;
    }

    if (normalizedSql.startsWith('INSERT INTO job_items')) {
      const [
        id,
        jobId,
        rowNumber,
        ean,
        asin,
        supplierTitle,
        supplierCost,
        spreadsheetSalesPrice,
        status,
      ] = values;
      this.jobItems.push({
        id: String(id),
        job_id: String(jobId),
        row_number: Number(rowNumber),
        ean: ean === null ? null : String(ean),
        asin: String(asin),
        supplier_title: supplierTitle === null ? null : String(supplierTitle),
        supplier_cost: Number(supplierCost),
        spreadsheet_sales_price:
          spreadsheetSalesPrice === null ? null : Number(spreadsheetSalesPrice),
        status: String(status),
      });
      return;
    }

    throw new Error(`Unsupported fake D1 run SQL: ${normalizedSql}`);
  }

  executeFirst<T>(sql: string, values: unknown[]): T | null {
    if (this.failNextFirst) {
      this.failNextFirst = false;
      throw new Error('D1 first failed with token=SECRET');
    }

    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    if (normalizedSql.startsWith('SELECT id, status, total_items FROM jobs')) {
      const [jobId] = values;
      return (this.jobs.get(String(jobId)) ?? null) as T | null;
    }

    throw new Error(`Unsupported fake D1 first SQL: ${normalizedSql}`);
  }

  executeAll<T>(sql: string, values: unknown[]): T[] {
    if (this.failNextAll) {
      this.failNextAll = false;
      throw new Error('D1 all failed with token=SECRET');
    }

    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    if (normalizedSql.startsWith('SELECT * FROM item_results')) {
      const [jobId] = values;
      return this.itemResults.filter((result) => result.job_id === jobId) as T[];
    }

    throw new Error(`Unsupported fake D1 all SQL: ${normalizedSql}`);
  }
}

function createTestEnv(): Env & { DB: FakeD1Database } {
  const db = new FakeD1Database();
  return { DB: db } as Env & { DB: FakeD1Database };
}

describe('GET /health', () => {
  it('returns a simple ok JSON response', async () => {
    const response = await worker.fetch(new Request('https://example.test/health'), createTestEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('POST /jobs', () => {
  it('creates a D1 job and normalizes ASIN values', async () => {
    const env = createTestEnv();
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test01', ean: '5012345678900', supplierCost: 10 }],
        }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      status: 'QUEUED',
      itemCount: 1,
    });
    expect(body).toHaveProperty('jobId');
    expect(env.DB.jobs.get((body as { jobId: string }).jobId)).toMatchObject({
      status: 'QUEUED',
      total_items: 1,
    });
    expect(env.DB.jobItems).toMatchObject([
      {
        asin: 'B000TEST01',
        ean: '5012345678900',
        supplier_cost: 10,
        status: 'CREATED',
      },
    ]);
  });

  it('returns standardized validation errors for invalid payloads', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({ items: [] }),
      }),
      createTestEnv(),
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
      createTestEnv(),
    );

    expect(response.status).toBe(400);
  });

  it('creates a D1 job from text/csv input and handles quoted titles', async () => {
    const env = createTestEnv();
    const csv = [
      'ASIN,EAN,Title,Cost Price,Sales Price',
      'b000test05,5012345678901,"Widget, boxed",\u00a310.50,"12,99"',
      '',
    ].join('\n');

    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv; charset=utf-8' },
        body: csv,
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      status: 'QUEUED',
      itemCount: 1,
    });
    expect(env.DB.jobItems).toMatchObject([
      {
        asin: 'B000TEST05',
        ean: '5012345678901',
        supplier_title: 'Widget, boxed',
        supplier_cost: 10.5,
        spreadsheet_sales_price: 12.99,
      },
    ]);
  });

  it('normalizes decimal and thousands separators predictably from CSV money fields', async () => {
    const env = createTestEnv();
    const csv = [
      'ASIN,Cost Price,Sales Price',
      'b000sep001,"12,99","12,99"',
      'b000sep002,12.99,12.99',
      'b000sep003,"1,234","1,234"',
      'b000sep004,1.234,1.234',
      'b000sep005,"1,234.56","1,234.56"',
      'b000sep006,"1.234,56","1.234,56"',
    ].join('\n');

    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csv,
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(env.DB.jobItems.map((item) => item.supplier_cost)).toEqual([
      12.99,
      12.99,
      1234,
      1234,
      1234.56,
      1234.56,
    ]);
    expect(env.DB.jobItems.map((item) => item.spreadsheet_sales_price)).toEqual([
      12.99,
      12.99,
      1234,
      1234,
      1234.56,
      1234.56,
    ]);
  });

  it('creates a D1 job from an explicit csv JSON payload', async () => {
    const env = createTestEnv();

    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          csv: ['ASIN,Description,Cost Price', 'b000test06,From JSON csv,9.25'].join('\n'),
        }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      status: 'QUEUED',
      itemCount: 1,
    });
    expect(env.DB.jobItems).toMatchObject([
      {
        asin: 'B000TEST06',
        supplier_title: 'From JSON csv',
        supplier_cost: 9.25,
      },
    ]);
  });

  it('returns a controlled error for malformed CSV', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: 'ASIN,Cost Price\n"B000TEST07,10',
      }),
      createTestEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Invalid request payload',
      },
    });
  });

  it('rejects CSV rows with invalid cost values', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: 'ASIN,Cost Price\nB000TEST08,not-a-price',
      }),
      createTestEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Invalid request payload',
      },
    });
  });

  it('rejects CSV rows without ASIN', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: 'ASIN,Cost Price\n,10.00',
      }),
      createTestEnv(),
    );

    expect(response.status).toBe(400);
  });

  it('rejects CSV batches with more than 100 items', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => {
      const suffix = String(index).padStart(7, '0');
      return `B${suffix}01,10`;
    });
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: ['ASIN,Cost Price', ...rows].join('\n'),
      }),
      createTestEnv(),
    );

    expect(response.status).toBe(400);
  });

  it('removes identical ASIN EAN and cost duplicates while keeping different costs', async () => {
    const env = createTestEnv();
    const csv = [
      'ASIN,EAN,Title,Cost Price',
      'b000test09,5012345678909,First,\u00a310.00',
      'B000TEST09,5012345678909,Duplicate,10',
      'B000TEST09,5012345678909,Different cost,11',
    ].join('\n');

    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csv,
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      itemCount: 2,
    });
    expect(env.DB.jobItems.map((item) => item.supplier_title)).toEqual([
      'First',
      'Different cost',
    ]);
  });
});

describe('GET /jobs/:jobId', () => {
  it('returns job status for a previously created job', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test02', supplierCost: 11 }],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    const response = await worker.fetch(
      new Request(`https://example.test/jobs/${created.jobId}`),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: created.jobId,
      status: 'QUEUED',
      itemCount: 1,
    });
  });

  it('returns standardized 404 JSON when the job does not exist', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs/job_missing'),
      createTestEnv(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Job not found',
      },
    });
  });

  it('normalizes unexpected D1 errors without exposing details', async () => {
    const env = createTestEnv();
    env.DB.failNextFirst = true;

    const response = await worker.fetch(
      new Request('https://example.test/jobs/job_d1_error'),
      env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'internal_error',
        message: 'Unexpected error',
      },
    });
  });
});

describe('GET /jobs/:jobId/results', () => {
  it('returns an empty stable results envelope for this phase', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test03', supplierCost: 12 }],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    const response = await worker.fetch(
      new Request(`https://example.test/jobs/${created.jobId}/results`),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: created.jobId,
      status: 'QUEUED',
      results: [],
    });
  });

  it('returns standardized 404 JSON when results are requested for a missing job', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/jobs/job_missing/results'),
      createTestEnv(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Job not found',
      },
    });
  });

  it('normalizes unexpected D1 result errors without exposing details', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test04', supplierCost: 13 }],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };
    env.DB.failNextAll = true;

    const response = await worker.fetch(
      new Request(`https://example.test/jobs/${created.jobId}/results`),
      env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'internal_error',
        message: 'Unexpected error',
      },
    });
  });
});
