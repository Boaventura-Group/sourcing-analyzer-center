import type {
  CreateJobRequest,
  CreateJobResponse,
  JobResultsResponse,
  JobStatus,
  JobStatusResponse,
  SupplierItemInput,
} from './types';

type D1JobRow = {
  id: string;
  status: JobStatus;
  total_items: number;
};

type D1ItemResultRow = Record<string, unknown>;

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function optionalText(value: string | undefined): string | null {
  return value ?? null;
}

function optionalNumber(value: number | undefined): number | null {
  return value ?? null;
}

export async function createD1Job(
  db: D1Database,
  request: CreateJobRequest,
): Promise<CreateJobResponse> {
  const jobId = createId('job');
  const now = new Date().toISOString();
  const status: JobStatus = 'QUEUED';
  const statements = [
    db
      .prepare(
        `INSERT INTO jobs (
          id,
          status,
          total_items,
          processed_items,
          profitable_items,
          error_items,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 0, 0, 0, ?, ?)`,
      )
      .bind(jobId, status, request.items.length, now, now),
    ...request.items.map((item, index) => bindJobItemInsert(db, jobId, item, index + 1, now)),
  ];

  await db.batch(statements);

  return {
    jobId,
    status,
    itemCount: request.items.length,
  };
}

function bindJobItemInsert(
  db: D1Database,
  jobId: string,
  item: SupplierItemInput,
  rowNumber: number,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO job_items (
        id,
        job_id,
        row_number,
        ean,
        asin,
        supplier_title,
        supplier_cost,
        spreadsheet_sales_price,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId('job_item'),
      jobId,
      rowNumber,
      optionalText(item.ean),
      item.asin,
      optionalText(item.supplierTitle),
      item.supplierCost,
      optionalNumber(item.spreadsheetSalesPrice),
      'CREATED',
      now,
      now,
    );
}

export async function getD1JobStatus(db: D1Database, jobId: string): Promise<JobStatusResponse | null> {
  const row = await db
    .prepare(
      `SELECT id, status, total_items
       FROM jobs
       WHERE id = ?`,
    )
    .bind(jobId)
    .first<D1JobRow>();

  if (!row) {
    return null;
  }

  return {
    jobId: row.id,
    status: row.status,
    itemCount: row.total_items,
  };
}

export const getD1JobById = getD1JobStatus;

export async function updateD1JobStatus(
  db: D1Database,
  jobId: string,
  status: JobStatus,
  expectedStatus: JobStatus,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE jobs
       SET status = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
    )
    .bind(status, now, jobId, expectedStatus)
    .run();
}

export async function getD1JobResults(
  db: D1Database,
  jobId: string,
): Promise<JobResultsResponse | null> {
  const status = await getD1JobStatus(db, jobId);

  if (!status) {
    return null;
  }

  const results = await db
    .prepare(
      `SELECT *
       FROM item_results
       WHERE job_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(jobId)
    .all<D1ItemResultRow>();

  return {
    jobId: status.jobId,
    status: status.status,
    results: results.results,
  };
}
