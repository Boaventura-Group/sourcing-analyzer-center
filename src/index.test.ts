import worker from './index';
import type { Env } from './index';
import { processJobQueueMessage } from './jobs/processJob';
import type { JobQueueMessage } from './jobs/jobQueue';

type JobRecord = {
  id: string;
  status: string;
  total_items: number;
  processed_items: number;
  profitable_items: number;
  error_items: number;
  updated_at?: string;
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
  error_message?: string | null;
};

type ItemResultRecord = Record<string, unknown>;

type RunResult = { success: true; meta: { changes: number } };
type QueueSendOptions = Parameters<Queue<JobQueueMessage>['send']>[1];

class FakeQueue {
  readonly sentMessages: Array<{ body: JobQueueMessage; options?: QueueSendOptions }> = [];
  failNextSend = false;

  async send(body: JobQueueMessage, options?: QueueSendOptions): Promise<void> {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('Queue send failed with token=SECRET');
    }

    this.sentMessages.push({ body, options });
  }
}

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
    this.db.lastRunChanges = 1;
    this.db.executeRun(this.sql, this.values);
    return { success: true, meta: { changes: this.db.lastRunChanges } };
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
  forceNextCompleteJobNoop = false;
  lastRunChanges = 1;

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
        processed_items: 0,
        profitable_items: 0,
        error_items: 0,
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
        error_message: null,
      });
      return;
    }

    if (normalizedSql.startsWith('INSERT OR REPLACE INTO item_results')) {
      const [
        id,
        jobId,
        jobItemId,
        asin,
        ean,
        title,
        packQty,
        supplierCost,
        adjustedCost,
        spreadsheetSalesPrice,
        amazonBuyBox,
        keepaBuyBox,
        validatedSalesPrice,
        amazonFeesEstimate,
        prepFee,
        netProfit,
        roiPercent,
        keepaRating,
        keepaReviewCount,
        keepaBsrCurrent,
        keepaAvgBsr30,
        keepaAvgBsr90,
        keepaSalesRankDrops30,
        keepaSalesRankDrops90,
        keepaOfferCount,
        keepaSellerCount,
        priceStatus,
        decisionStatus,
        notes,
        rawAmazonPricingJson,
        rawAmazonFeesEstimateJson,
        rawKeepaJson,
        createdAt,
        updatedAt,
      ] = values;
      const record: ItemResultRecord = {
        id,
        job_id: jobId,
        job_item_id: jobItemId,
        asin,
        ean,
        title,
        pack_qty: packQty,
        supplier_cost: supplierCost,
        adjusted_cost: adjustedCost,
        spreadsheet_sales_price: spreadsheetSalesPrice,
        amazon_buy_box: amazonBuyBox,
        keepa_buy_box: keepaBuyBox,
        validated_sales_price: validatedSalesPrice,
        amazon_fees_estimate: amazonFeesEstimate,
        prep_fee: prepFee,
        net_profit: netProfit,
        roi_percent: roiPercent,
        keepa_rating: keepaRating,
        keepa_review_count: keepaReviewCount,
        keepa_bsr_current: keepaBsrCurrent,
        keepa_avg_bsr_30: keepaAvgBsr30,
        keepa_avg_bsr_90: keepaAvgBsr90,
        keepa_sales_rank_drops_30: keepaSalesRankDrops30,
        keepa_sales_rank_drops_90: keepaSalesRankDrops90,
        keepa_offer_count: keepaOfferCount,
        keepa_seller_count: keepaSellerCount,
        price_status: priceStatus,
        decision_status: decisionStatus,
        notes,
        raw_amazon_pricing_json: rawAmazonPricingJson,
        raw_amazon_fees_estimate_json: rawAmazonFeesEstimateJson,
        raw_keepa_json: rawKeepaJson,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      const existingIndex = this.itemResults.findIndex((result) => result.id === id);

      if (existingIndex >= 0) {
        this.itemResults[existingIndex] = record;
      } else {
        this.itemResults.push(record);
      }

      return;
    }

    if (normalizedSql.startsWith('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?')) {
      const [status, updatedAt, jobId, expectedStatus] = values;
      const job = this.jobs.get(String(jobId));

      if (job && job.status === String(expectedStatus)) {
        job.status = String(status);
        job.updated_at = String(updatedAt);
      }

      return;
    }

    if (
      normalizedSql.startsWith(
        "UPDATE job_items SET status = 'PROCESSING', error_message = NULL, updated_at = ? WHERE id = ? AND status IN ('CREATED', 'PROCESSING')",
      )
    ) {
      const [, jobItemId] = values;
      const item = this.jobItems.find((candidate) => candidate.id === jobItemId);

      if (item && (item.status === 'CREATED' || item.status === 'PROCESSING')) {
        item.status = 'PROCESSING';
        item.error_message = null;
      }

      return;
    }

    if (
      normalizedSql.startsWith(
        "UPDATE job_items SET status = 'COMPLETED', error_message = NULL, updated_at = ? WHERE id = ?",
      )
    ) {
      const [updatedAt, jobItemId] = values;
      const item = this.jobItems.find((candidate) => candidate.id === jobItemId);

      if (item) {
        item.status = 'COMPLETED';
        item.error_message = null;
      }

      void updatedAt;
      return;
    }

    if (
      normalizedSql.startsWith(
        "UPDATE job_items SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?",
      )
    ) {
      const [errorMessage, updatedAt, jobItemId] = values;
      const item = this.jobItems.find((candidate) => candidate.id === jobItemId);

      if (item) {
        item.status = 'FAILED';
        item.error_message = String(errorMessage);
      }

      void updatedAt;
      return;
    }

    if (normalizedSql.startsWith('UPDATE jobs SET processed_items =')) {
      const jobId = String(values.at(-1));
      const job = this.jobs.get(jobId);

      if (job) {
        const jobItems = this.jobItems.filter((item) => item.job_id === jobId);
        job.processed_items = jobItems.filter((item) =>
          ['COMPLETED', 'FAILED'].includes(item.status),
        ).length;
        job.profitable_items = this.itemResults.filter(
          (result) => result.job_id === jobId && result.decision_status === 'PROFIT_POSITIVE',
        ).length;
        job.error_items = jobItems.filter((item) => item.status === 'FAILED').length;
      }

      return;
    }

    if (normalizedSql.startsWith("UPDATE jobs SET status = 'COMPLETED', updated_at = ? WHERE id = ?")) {
      const [updatedAt, jobId] = values;
      const job = this.jobs.get(String(jobId));
      const hasOpenItems = this.jobItems.some(
        (item) => item.job_id === jobId && !['COMPLETED', 'FAILED'].includes(item.status),
      );

      if (this.forceNextCompleteJobNoop) {
        this.forceNextCompleteJobNoop = false;
        this.lastRunChanges = 0;
        return;
      }

      if (job && job.status === 'PROCESSING' && !hasOpenItems) {
        job.status = 'COMPLETED';
        job.updated_at = String(updatedAt);
        this.lastRunChanges = 1;
        return;
      }

      this.lastRunChanges = 0;
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

    if (normalizedSql.startsWith('SELECT id, job_id, row_number')) {
      const [jobId] = values;
      return this.jobItems
        .filter((item) => item.job_id === jobId && ['CREATED', 'PROCESSING'].includes(item.status))
        .sort((left, right) => left.row_number - right.row_number || left.id.localeCompare(right.id)) as T[];
    }

    throw new Error(`Unsupported fake D1 all SQL: ${normalizedSql}`);
  }
}

function createTestEnv(): Env & { DB: FakeD1Database; JOB_QUEUE: FakeQueue } {
  const db = new FakeD1Database();
  const jobQueue = new FakeQueue();
  return { DB: db, JOB_QUEUE: jobQueue } as Env & { DB: FakeD1Database; JOB_QUEUE: FakeQueue };
}

type ConsoleMethod = 'info' | 'warn' | 'error';
type StructuredLogPayload = Record<string, unknown>;

function getStructuredLogPayloads(
  method: ConsoleMethod,
  event?: string,
): StructuredLogPayload[] {
  return vi
    .mocked(console[method])
    .mock.calls.map((call) => call[1])
    .filter(
      (payload): payload is StructuredLogPayload =>
        typeof payload === 'object' && payload !== null,
    )
    .filter((payload) => event === undefined || payload.event === event);
}

function getMetricNames(): unknown[] {
  return getStructuredLogPayloads('info', 'metric_event').map((payload) => payload.metricName);
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
    expect(env.JOB_QUEUE.sentMessages).toHaveLength(1);
    expect(env.JOB_QUEUE.sentMessages[0]?.body).toEqual({
      jobId: (body as { jobId: string }).jobId,
      timestamp: expect.any(String),
      schemaVersion: 1,
    });
  });

  it('emits correlated HTTP and job_created structured logs', async () => {
    const env = createTestEnv();
    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'cf-ray': 'ray-create-job' },
        body: JSON.stringify({
          items: [{ asin: 'b000test12', supplierCost: 10 }],
        }),
      }),
      env,
    );
    const body = (await response.json()) as { jobId: string };

    expect(response.status).toBe(201);
    expect(getStructuredLogPayloads('info', 'http_request_started')).toContainEqual(
      expect.objectContaining({
        event: 'http_request_started',
        stage: 'http',
        traceId: 'ray-create-job',
        method: 'POST',
        path: '/jobs',
      }),
    );
    expect(getStructuredLogPayloads('info', 'job_created')).toContainEqual(
      expect.objectContaining({
        event: 'job_created',
        stage: 'job_create',
        traceId: 'ray-create-job',
        jobId: body.jobId,
        status: 'QUEUED',
        itemCount: 1,
      }),
    );
    expect(getStructuredLogPayloads('info', 'http_request_completed')).toContainEqual(
      expect.objectContaining({
        event: 'http_request_completed',
        stage: 'http',
        traceId: 'ray-create-job',
        status: 201,
        durationMs: expect.any(Number),
      }),
    );
    expect(getMetricNames()).toContain('jobs_created');
  });

  it('returns a controlled error when enqueue fails after D1 persistence', async () => {
    const env = createTestEnv();
    env.JOB_QUEUE.failNextSend = true;

    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'b000test11', supplierCost: 10 }],
        }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    const createdJobId = Array.from(env.DB.jobs.keys())[0];
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'job_enqueue_failed',
        message: 'Job was created but could not be queued for processing',
        details: {
          jobId: createdJobId,
          status: 'QUEUED',
          itemCount: 1,
        },
      },
    });
    expect(env.DB.jobs.size).toBe(1);
    expect(env.JOB_QUEUE.sentMessages).toHaveLength(0);

    const errorLogs = getStructuredLogPayloads('error', 'job_enqueue_failed');
    const serializedErrorLogs = JSON.stringify(errorLogs);
    expect(errorLogs).toContainEqual(
      expect.objectContaining({
        event: 'job_enqueue_failed',
        stage: 'job_create',
        jobId: createdJobId,
        status: 'QUEUED',
        itemCount: 1,
        errorCode: 'job_enqueue_failed',
      }),
    );
    expect(serializedErrorLogs).not.toContain('SECRET');
    expect(serializedErrorLogs).not.toContain('token=SECRET');
    expect(getMetricNames()).toContain('job_enqueue_failed');
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

  it('uses the next matching column alias when the first alias value is empty', async () => {
    const env = createTestEnv();
    const csv = ['ASIN,Cost,Cost Price', 'B000TEST10,,10.50'].join('\n');

    const response = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csv,
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(env.DB.jobItems).toMatchObject([
      {
        asin: 'B000TEST10',
        supplier_cost: 10.5,
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

describe('queue consumer', () => {
  function queueBatchForBody(
    body: unknown,
    controls: { ack: () => void; retry: () => void },
  ): MessageBatch<unknown> {
    return {
      queue: 'sourcing-analyzer-jobs',
      metadata: {},
      messages: [
        {
          body,
          ack: controls.ack,
          retry: controls.retry,
        },
      ],
      ackAll: () => {},
      retryAll: () => {},
    } as unknown as MessageBatch<unknown>;
  }

  function queueMessage(jobId: string): JobQueueMessage {
    return {
      jobId,
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
    };
  }

  function createBatchItems(count: number): Array<{ asin: string; supplierCost: number }> {
    return Array.from({ length: count }, (_, index) => ({
      asin: `B${String(index + 1).padStart(9, '0')}`,
      supplierCost: 1,
    }));
  }

  it('worker queue handler processes queued job messages', async () => {
    const env = createTestEnv();
    env.DB.jobs.set('job_worker_queue', {
      id: 'job_worker_queue',
      status: 'QUEUED',
      total_items: 1,
      processed_items: 0,
      profitable_items: 0,
      error_items: 0,
    });
    env.DB.jobItems.push({
      id: 'job_item_worker_queue',
      job_id: 'job_worker_queue',
      row_number: 1,
      ean: null,
      asin: 'B000PROFIT',
      supplier_title: 'Worker queue item',
      supplier_cost: 5,
      spreadsheet_sales_price: 20,
      status: 'CREATED',
      error_message: null,
    });
    let acknowledged = false;

    await worker.queue?.(
      queueBatchForBody(
        {
          jobId: 'job_worker_queue',
          timestamp: new Date().toISOString(),
          schemaVersion: 1,
        },
        {
          ack: () => {
            acknowledged = true;
          },
          retry: () => {},
        },
      ),
      env,
    );

    expect(env.DB.jobs.get('job_worker_queue')).toMatchObject({
      status: 'COMPLETED',
      processed_items: 1,
      profitable_items: 1,
      error_items: 0,
    });
    expect(env.DB.itemResults).toHaveLength(1);
    expect(acknowledged).toBe(true);
  });

  it.each([null, 'not-json', 42, {}, { jobId: 'job_1' }, { jobId: 'job_1', schemaVersion: 2 }])(
    'acks and discards malformed queue bodies without throwing: %s',
    async (body) => {
      const env = createTestEnv();
      const ack = vi.fn();
      const retry = vi.fn();

      await expect(worker.queue?.(queueBatchForBody(body, { ack, retry }), env)).resolves.toBeUndefined();

      expect(ack).toHaveBeenCalledTimes(1);
      expect(retry).not.toHaveBeenCalled();
      expect(env.DB.jobs.size).toBe(0);
      expect(getStructuredLogPayloads('warn', 'job_processing_ignored')).toContainEqual(
        expect.objectContaining({
          event: 'job_processing_ignored',
          stage: 'queue',
          reason: 'malformed_message',
        }),
      );
      expect(getMetricNames()).toContain('jobs_ignored');
    },
  );

  it('ignores messages for jobs that do not exist', async () => {
    const env = createTestEnv();

    await expect(
      processJobQueueMessage(env.DB, {
        jobId: 'job_missing',
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
      }),
    ).resolves.toEqual({ action: 'ignored_missing_job' });
    expect(getStructuredLogPayloads('info', 'job_processing_ignored')).toContainEqual(
      expect.objectContaining({
        event: 'job_processing_ignored',
        stage: 'job_processing',
        jobId: 'job_missing',
        reason: 'missing_job',
      }),
    );
    expect(getMetricNames()).toContain('jobs_ignored');
  });

  it('resumes jobs already in PROCESSING so queue retries can finish partial work', async () => {
    const env = createTestEnv();
    env.DB.jobs.set('job_existing', {
      id: 'job_existing',
      status: 'PROCESSING',
      total_items: 1,
      processed_items: 0,
      profitable_items: 0,
      error_items: 0,
    });
    env.DB.jobItems.push({
      id: 'job_item_existing',
      job_id: 'job_existing',
      row_number: 1,
      ean: null,
      asin: 'B000PROFIT',
      supplier_title: null,
      supplier_cost: 5,
      spreadsheet_sales_price: 20,
      status: 'CREATED',
      error_message: null,
    });

    await expect(
      processJobQueueMessage(env.DB, {
        jobId: 'job_existing',
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
      }),
    ).resolves.toEqual({ action: 'processed', processedItems: 1, failedItems: 0 });
    expect(env.DB.jobs.get('job_existing')?.status).toBe('COMPLETED');
  });

  it('logs structural D1 failures as retryable queue errors and rethrows', async () => {
    const env = createTestEnv();
    env.DB.jobs.set('job_retryable_error', {
      id: 'job_retryable_error',
      status: 'QUEUED',
      total_items: 1,
      processed_items: 0,
      profitable_items: 0,
      error_items: 0,
    });
    env.DB.failNextAll = true;

    await expect(processJobQueueMessage(env.DB, queueMessage('job_retryable_error'))).rejects.toThrow(
      'D1 all failed',
    );

    const errorLogs = getStructuredLogPayloads('error', 'job_processing_retryable_error');
    const serialized = JSON.stringify(errorLogs);
    expect(errorLogs).toContainEqual(
      expect.objectContaining({
        event: 'job_processing_retryable_error',
        stage: 'job_processing',
        jobId: 'job_retryable_error',
        schemaVersion: 1,
        errorCode: 'Error',
      }),
    );
    expect(serialized).not.toContain('token=SECRET');
    expect(serialized).not.toContain('SECRET');
    expect(getMetricNames()).toContain('queue_messages_retryable_error');
  });

  it.each(['COMPLETED', 'FAILED'] as const)(
    'does not reprocess terminal jobs already in %s',
    async (status) => {
      const env = createTestEnv();
      env.DB.jobs.set('job_existing', {
        id: 'job_existing',
        status,
        total_items: 1,
        processed_items: 0,
        profitable_items: 0,
        error_items: 0,
      });

      await expect(
        processJobQueueMessage(env.DB, {
          jobId: 'job_existing',
          timestamp: new Date().toISOString(),
          schemaVersion: 1,
        }),
      ).resolves.toEqual({ action: 'ignored_terminal_job', status });
      expect(env.DB.jobs.get('job_existing')?.status).toBe(status);
    },
  );

  it('processes queued jobs to completion with deterministic fake data and persisted results', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              asin: 'B000PROFIT',
              supplierTitle: 'Supplier positive',
              supplierCost: 5,
              spreadsheetSalesPrice: 20,
            },
            {
              asin: 'B000NEG001',
              supplierTitle: 'Supplier negative',
              supplierCost: 12,
              spreadsheetSalesPrice: 10,
            },
            {
              asin: 'B000PACK02',
              supplierTitle: 'Supplier pack fallback',
              supplierCost: 4,
              spreadsheetSalesPrice: 20,
            },
          ],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    await expect(
      processJobQueueMessage(env.DB, {
        jobId: created.jobId,
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
      }),
    ).resolves.toEqual({ action: 'processed', processedItems: 3, failedItems: 0 });
    expect(env.DB.jobs.get(created.jobId)).toMatchObject({
      status: 'COMPLETED',
      processed_items: 3,
      profitable_items: 2,
      error_items: 0,
    });
    expect(env.DB.itemResults).toHaveLength(3);
    expect(env.DB.itemResults.map((result) => result.decision_status)).toEqual(
      expect.arrayContaining(['PROFIT_POSITIVE', 'NOT_PROFITABLE']),
    );
    expect(env.DB.itemResults.find((result) => result.asin === 'B000PACK02')).toMatchObject({
      pack_qty: 2,
      adjusted_cost: 8,
      decision_status: 'PROFIT_POSITIVE',
      roi_percent: expect.any(Number),
    });

    const resultsResponse = await worker.fetch(
      new Request(`https://example.test/jobs/${created.jobId}/results`),
      env,
    );
    const resultsBody = (await resultsResponse.json()) as { results: ItemResultRecord[] };

    expect(resultsResponse.status).toBe(200);
    expect(resultsBody.results).toHaveLength(3);
  });

  it.each([5, 20, 100])(
    'processes a local batch of %s ASINs to completion without duplicate results',
    async (itemCount) => {
      const env = createTestEnv();
      const createResponse = await worker.fetch(
        new Request('https://example.test/jobs', {
          method: 'POST',
          body: JSON.stringify({
            items: createBatchItems(itemCount),
          }),
        }),
        env,
      );
      const created = (await createResponse.json()) as { jobId: string };

      await expect(processJobQueueMessage(env.DB, queueMessage(created.jobId))).resolves.toEqual({
        action: 'processed',
        processedItems: itemCount,
        failedItems: 0,
      });

      expect(env.DB.jobs.get(created.jobId)).toMatchObject({
        status: 'COMPLETED',
        processed_items: itemCount,
        profitable_items: itemCount,
        error_items: 0,
      });
      expect(env.DB.itemResults).toHaveLength(itemCount);
      expect(new Set(env.DB.itemResults.map((result) => result.job_item_id)).size).toBe(
        itemCount,
      );
    },
  );

  it('emits structured processing events and metric logs without raw payloads or secrets', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { asin: 'B000PROFIT', supplierCost: 5, spreadsheetSalesPrice: 20 },
            { asin: 'B000NEG001', supplierCost: 12, spreadsheetSalesPrice: 10 },
            { asin: 'B0000ERROR', supplierCost: 5 },
          ],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    await processJobQueueMessage(env.DB, queueMessage(created.jobId));

    expect(getStructuredLogPayloads('info', 'job_processing_started')).toContainEqual(
      expect.objectContaining({
        event: 'job_processing_started',
        stage: 'job_processing',
        jobId: created.jobId,
        status: 'PROCESSING',
        schemaVersion: 1,
      }),
    );
    expect(getStructuredLogPayloads('info', 'job_item_processed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'job_item_processed',
          stage: 'job_processing',
          asin: 'B000PROFIT',
          status: 'PROFIT_POSITIVE',
        }),
        expect.objectContaining({
          event: 'job_item_processed',
          stage: 'job_processing',
          asin: 'B000NEG001',
          status: 'NOT_PROFITABLE',
        }),
      ]),
    );
    expect(getStructuredLogPayloads('warn', 'job_item_failed')).toContainEqual(
      expect.objectContaining({
        event: 'job_item_failed',
        stage: 'job_processing',
        asin: 'B0000ERROR',
        errorCode: 'FakeSourcingDataError',
        errorMessage: 'Controlled fake sourcing data failure',
      }),
    );
    expect(getStructuredLogPayloads('info', 'job_processing_completed')).toContainEqual(
      expect.objectContaining({
        event: 'job_processing_completed',
        stage: 'job_processing',
        jobId: created.jobId,
        processedItems: 3,
        profitableItems: 1,
        errorItems: 1,
        durationMs: expect.any(Number),
      }),
    );
    expect(getMetricNames()).toEqual(
      expect.arrayContaining([
        'items_processed',
        'items_failed',
        'items_profitable',
        'jobs_completed',
        'queue_messages_processed',
        'processing_duration_ms',
      ]),
    );
    expect(JSON.stringify([...getStructuredLogPayloads('info'), ...getStructuredLogPayloads('warn')])).not.toContain(
      'raw_',
    );
    expect(JSON.stringify([...getStructuredLogPayloads('info'), ...getStructuredLogPayloads('warn')])).not.toContain(
      'SECRET',
    );
  });

  it('marks item-specific fake errors without retrying the whole message', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { asin: 'B0000ERROR', supplierCost: 5 },
            { asin: 'B000PROFIT', supplierCost: 5, spreadsheetSalesPrice: 20 },
          ],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    await expect(
      processJobQueueMessage(env.DB, {
        jobId: created.jobId,
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
      }),
    ).resolves.toEqual({ action: 'processed', processedItems: 1, failedItems: 1 });
    expect(env.DB.jobs.get(created.jobId)).toMatchObject({
      status: 'COMPLETED',
      processed_items: 2,
      profitable_items: 1,
      error_items: 1,
    });
    expect(env.DB.jobItems.find((item) => item.asin === 'B0000ERROR')).toMatchObject({
      status: 'FAILED',
      error_message: 'Controlled fake sourcing data failure',
    });
    expect(env.DB.jobItems.find((item) => item.asin === 'B000PROFIT')).toMatchObject({
      status: 'COMPLETED',
    });
    expect(env.DB.itemResults).toHaveLength(1);
    expect(env.DB.itemResults[0]).toMatchObject({ asin: 'B000PROFIT' });
  });

  it('does not duplicate results or corrupt counters when a completed job is retried', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { asin: 'B000PROFIT', supplierCost: 5, spreadsheetSalesPrice: 20 },
            { asin: 'B000NEG001', supplierCost: 12, spreadsheetSalesPrice: 10 },
          ],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };
    const message = {
      jobId: created.jobId,
      timestamp: new Date().toISOString(),
      schemaVersion: 1 as const,
    };

    await processJobQueueMessage(env.DB, message);
    await processJobQueueMessage(env.DB, message);

    expect(env.DB.itemResults).toHaveLength(2);
    expect(new Set(env.DB.itemResults.map((result) => result.id)).size).toBe(2);
    expect(env.DB.jobs.get(created.jobId)).toMatchObject({
      status: 'COMPLETED',
      processed_items: 2,
      profitable_items: 1,
      error_items: 0,
    });
    expect(getMetricNames().filter((name) => name === 'jobs_completed')).toHaveLength(1);
    expect(getStructuredLogPayloads('info', 'job_processing_completed')).toHaveLength(1);
  });

  it('does not emit job completion when completeJobIfDone is a no-op', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'B000PROFIT', supplierCost: 5, spreadsheetSalesPrice: 20 }],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };
    env.DB.forceNextCompleteJobNoop = true;

    await expect(processJobQueueMessage(env.DB, queueMessage(created.jobId))).resolves.toEqual({
      action: 'processed',
      processedItems: 1,
      failedItems: 0,
    });

    expect(env.DB.itemResults).toHaveLength(1);
    expect(new Set(env.DB.itemResults.map((result) => result.job_item_id)).size).toBe(1);
    expect(getMetricNames()).toEqual(
      expect.arrayContaining(['queue_messages_processed', 'processing_duration_ms']),
    );
    expect(getMetricNames().filter((name) => name === 'jobs_completed')).toHaveLength(0);
    expect(getStructuredLogPayloads('info', 'job_processing_completed')).toHaveLength(0);
  });

  it('persists skipped results when fake data has no Buy Box', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ asin: 'B00000NOBB', supplierCost: 5, spreadsheetSalesPrice: 9 }],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    await processJobQueueMessage(env.DB, {
      jobId: created.jobId,
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
    });

    expect(env.DB.jobs.get(created.jobId)).toMatchObject({
      status: 'COMPLETED',
      processed_items: 1,
      profitable_items: 0,
      error_items: 0,
    });
    expect(env.DB.itemResults).toHaveLength(1);
    expect(env.DB.itemResults[0]).toMatchObject({
      asin: 'B00000NOBB',
      price_status: 'NO_BUYBOX',
      decision_status: 'SKIPPED_NO_BUYBOX',
      validated_sales_price: null,
    });
  });

  it('emits review and insufficient-data metrics for mismatch, no Buy Box, and no fees', async () => {
    const env = createTestEnv();
    const createResponse = await worker.fetch(
      new Request('https://example.test/jobs', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            { asin: 'B000MISM02', supplierCost: 1 },
            { asin: 'B00000NOBB', supplierCost: 5, spreadsheetSalesPrice: 9 },
            { asin: 'B000NOFEES', supplierCost: 5, spreadsheetSalesPrice: 15 },
          ],
        }),
      }),
      env,
    );
    const created = (await createResponse.json()) as { jobId: string };

    await processJobQueueMessage(env.DB, queueMessage(created.jobId));

    expect(env.DB.jobs.get(created.jobId)).toMatchObject({
      status: 'COMPLETED',
      processed_items: 3,
      error_items: 0,
    });
    expect(env.DB.itemResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asin: 'B000MISM02',
          price_status: 'BUYBOX_MISMATCH_REVIEW',
        }),
        expect.objectContaining({
          asin: 'B00000NOBB',
          decision_status: 'SKIPPED_NO_BUYBOX',
        }),
        expect.objectContaining({
          asin: 'B000NOFEES',
          decision_status: 'SKIPPED_NO_FEES',
        }),
      ]),
    );
    expect(getMetricNames()).toEqual(
      expect.arrayContaining([
        'price_mismatch_review_count',
        'no_buybox_count',
        'missing_fees_count',
      ]),
    );
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
