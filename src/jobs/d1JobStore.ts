import type {
  CreateJobRequest,
  CreateJobResponse,
  JobItemStatus,
  JobResultsResponse,
  JobStatus,
  JobStatusResponse,
  PublicJobResult,
  SupplierItemInput,
} from './types';

type D1JobRow = {
  id: string;
  status: JobStatus;
  total_items: number;
};

type D1PublicItemResultRow = {
  asin: string;
  ean: string | null;
  title: string | null;
  supplier_cost: number | null;
  pack_qty: number | null;
  adjusted_cost: number | null;
  spreadsheet_sales_price: number | null;
  amazon_buy_box: number | null;
  keepa_buy_box: number | null;
  validated_sales_price: number | null;
  amazon_fees_estimate: number | null;
  prep_fee: number | null;
  net_profit: number | null;
  roi_percent: number | null;
  keepa_rating: number | null;
  keepa_review_count: number | null;
  keepa_bsr_current: number | null;
  keepa_avg_bsr_30: number | null;
  keepa_avg_bsr_90: number | null;
  keepa_sales_rank_drops_30: number | null;
  keepa_sales_rank_drops_90: number | null;
  keepa_offer_count: number | null;
  keepa_seller_count: number | null;
  price_status: string | null;
  decision_status: string | null;
  notes: string | null;
};

type D1JobItemRow = {
  id: string;
  job_id: string;
  row_number: number;
  ean: string | null;
  asin: string;
  supplier_title: string | null;
  amazon_title: string | null;
  supplier_cost: number;
  spreadsheet_sales_price: number | null;
  status: JobItemStatus;
  error_message: string | null;
};

export type D1JobItem = {
  id: string;
  jobId: string;
  rowNumber: number;
  ean?: string;
  asin: string;
  supplierTitle?: string;
  amazonTitle?: string;
  supplierCost: number;
  spreadsheetSalesPrice?: number;
  status: JobItemStatus;
  errorMessage?: string;
};

export type SaveItemResultInput = {
  id: string;
  jobId: string;
  jobItemId: string;
  asin: string;
  ean?: string;
  title?: string;
  packQty: number;
  supplierCost: number;
  adjustedCost: number;
  spreadsheetSalesPrice?: number;
  amazonBuyBox?: number;
  keepaBuyBox?: number;
  validatedSalesPrice?: number;
  amazonFeesEstimate?: number;
  prepFee: number;
  netProfit?: number;
  roiPercent?: number;
  keepaRating?: number;
  keepaReviewCount?: number;
  keepaBsrCurrent?: number;
  keepaAvgBsr30?: number;
  keepaAvgBsr90?: number;
  keepaSalesRankDrops30?: number;
  keepaSalesRankDrops90?: number;
  keepaOfferCount?: number;
  keepaSellerCount?: number;
  priceStatus: string;
  decisionStatus: string;
  notes: string[];
  rawAmazonPricing?: unknown;
  rawAmazonFeesEstimate?: unknown;
  rawKeepa?: unknown;
};

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function optionalText(value: string | undefined): string | null {
  return value ?? null;
}

function optionalNumber(value: number | undefined): number | null {
  return value ?? null;
}

function optionalJson(value: unknown | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function mapD1JobItem(row: D1JobItemRow): D1JobItem {
  const item: D1JobItem = {
    id: row.id,
    jobId: row.job_id,
    rowNumber: row.row_number,
    asin: row.asin,
    supplierCost: row.supplier_cost,
    status: row.status,
  };

  if (row.ean !== null) {
    item.ean = row.ean;
  }

  if (row.supplier_title !== null) {
    item.supplierTitle = row.supplier_title;
  }

  if (row.amazon_title !== null) {
    item.amazonTitle = row.amazon_title;
  }

  if (row.spreadsheet_sales_price !== null) {
    item.spreadsheetSalesPrice = row.spreadsheet_sales_price;
  }

  if (row.error_message !== null) {
    item.errorMessage = row.error_message;
  }

  return item;
}

function parseNotes(notes: string | null): string[] | undefined {
  if (notes === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(notes) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((note): note is string => typeof note === 'string');
    }
  } catch {
    // Keep older non-JSON notes readable without exposing raw provider payloads.
  }

  return notes.trim().length > 0 ? [notes] : undefined;
}

function mapPublicJobResult(row: D1PublicItemResultRow): PublicJobResult {
  const result: PublicJobResult = {
    asin: row.asin,
  };

  if (row.ean !== null) result.ean = row.ean;
  if (row.title !== null) result.title = row.title;
  if (row.supplier_cost !== null) result.supplierCost = row.supplier_cost;
  if (row.pack_qty !== null) result.packQty = row.pack_qty;
  if (row.adjusted_cost !== null) result.adjustedCost = row.adjusted_cost;
  if (row.spreadsheet_sales_price !== null) result.spreadsheetSalesPrice = row.spreadsheet_sales_price;
  if (row.amazon_buy_box !== null) result.amazonBuyBox = row.amazon_buy_box;
  if (row.keepa_buy_box !== null) result.keepaBuyBox = row.keepa_buy_box;
  if (row.validated_sales_price !== null) result.validatedSalesPrice = row.validated_sales_price;
  if (row.amazon_fees_estimate !== null) result.amazonFeesEstimate = row.amazon_fees_estimate;
  if (row.prep_fee !== null) result.prepFee = row.prep_fee;
  if (row.net_profit !== null) result.netProfit = row.net_profit;
  if (row.roi_percent !== null) result.roiPercent = row.roi_percent;
  if (row.keepa_rating !== null) result.keepaRating = row.keepa_rating;
  if (row.keepa_review_count !== null) result.keepaReviewCount = row.keepa_review_count;
  if (row.keepa_bsr_current !== null) result.keepaBsrCurrent = row.keepa_bsr_current;
  if (row.keepa_avg_bsr_30 !== null) result.keepaAvgBsr30 = row.keepa_avg_bsr_30;
  if (row.keepa_avg_bsr_90 !== null) result.keepaAvgBsr90 = row.keepa_avg_bsr_90;
  if (row.keepa_sales_rank_drops_30 !== null) result.keepaSalesRankDrops30 = row.keepa_sales_rank_drops_30;
  if (row.keepa_sales_rank_drops_90 !== null) result.keepaSalesRankDrops90 = row.keepa_sales_rank_drops_90;
  if (row.keepa_offer_count !== null) result.keepaOfferCount = row.keepa_offer_count;
  if (row.keepa_seller_count !== null) result.keepaSellerCount = row.keepa_seller_count;
  if (row.price_status !== null) result.priceStatus = row.price_status;
  if (row.decision_status !== null) result.decisionStatus = row.decision_status;

  const notes = parseNotes(row.notes);
  if (notes !== undefined) {
    result.notes = notes;
  }

  return result;
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

export async function getPendingJobItems(db: D1Database, jobId: string): Promise<D1JobItem[]> {
  const rows = await db
    .prepare(
      `SELECT
         id,
         job_id,
         row_number,
         ean,
         asin,
         supplier_title,
         amazon_title,
         supplier_cost,
         spreadsheet_sales_price,
         status,
         error_message
       FROM job_items
       WHERE job_id = ?
         AND status IN ('CREATED', 'PROCESSING')
       ORDER BY row_number ASC, id ASC`,
    )
    .bind(jobId)
    .all<D1JobItemRow>();

  return rows.results.map(mapD1JobItem);
}

export async function markJobItemProcessing(db: D1Database, jobItemId: string): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE job_items
       SET status = 'PROCESSING', error_message = NULL, updated_at = ?
       WHERE id = ? AND status IN ('CREATED', 'PROCESSING')`,
    )
    .bind(now, jobItemId)
    .run();
}

export async function markJobItemCompleted(db: D1Database, jobItemId: string): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE job_items
       SET status = 'COMPLETED', error_message = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, jobItemId)
    .run();
}

export async function markJobItemFailed(
  db: D1Database,
  jobItemId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE job_items
       SET status = 'FAILED', error_message = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(errorMessage, now, jobItemId)
    .run();
}

export async function saveItemResult(
  db: D1Database,
  result: SaveItemResultInput,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT OR REPLACE INTO item_results (
        id,
        job_id,
        job_item_id,
        asin,
        ean,
        title,
        pack_qty,
        supplier_cost,
        adjusted_cost,
        spreadsheet_sales_price,
        amazon_buy_box,
        keepa_buy_box,
        validated_sales_price,
        amazon_fees_estimate,
        prep_fee,
        net_profit,
        roi_percent,
        keepa_rating,
        keepa_review_count,
        keepa_bsr_current,
        keepa_avg_bsr_30,
        keepa_avg_bsr_90,
        keepa_sales_rank_drops_30,
        keepa_sales_rank_drops_90,
        keepa_offer_count,
        keepa_seller_count,
        price_status,
        decision_status,
        notes,
        raw_amazon_pricing_json,
        raw_amazon_fees_estimate_json,
        raw_keepa_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      result.id,
      result.jobId,
      result.jobItemId,
      result.asin,
      optionalText(result.ean),
      optionalText(result.title),
      result.packQty,
      result.supplierCost,
      result.adjustedCost,
      optionalNumber(result.spreadsheetSalesPrice),
      optionalNumber(result.amazonBuyBox),
      optionalNumber(result.keepaBuyBox),
      optionalNumber(result.validatedSalesPrice),
      optionalNumber(result.amazonFeesEstimate),
      result.prepFee,
      optionalNumber(result.netProfit),
      optionalNumber(result.roiPercent),
      optionalNumber(result.keepaRating),
      optionalNumber(result.keepaReviewCount),
      optionalNumber(result.keepaBsrCurrent),
      optionalNumber(result.keepaAvgBsr30),
      optionalNumber(result.keepaAvgBsr90),
      optionalNumber(result.keepaSalesRankDrops30),
      optionalNumber(result.keepaSalesRankDrops90),
      optionalNumber(result.keepaOfferCount),
      optionalNumber(result.keepaSellerCount),
      result.priceStatus,
      result.decisionStatus,
      JSON.stringify(result.notes),
      optionalJson(result.rawAmazonPricing),
      optionalJson(result.rawAmazonFeesEstimate),
      optionalJson(result.rawKeepa),
      now,
      now,
    )
    .run();
}

export async function refreshJobCounters(db: D1Database, jobId: string): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE jobs
       SET processed_items = (
             SELECT COUNT(*)
             FROM job_items
             WHERE job_id = ? AND status IN ('COMPLETED', 'FAILED')
           ),
           profitable_items = (
             SELECT COUNT(*)
             FROM item_results
             WHERE job_id = ? AND decision_status = 'PROFIT_POSITIVE'
           ),
           error_items = (
             SELECT COUNT(*)
             FROM job_items
             WHERE job_id = ? AND status = 'FAILED'
           ),
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(jobId, jobId, jobId, now, jobId)
    .run();
}

export async function completeJobIfDone(db: D1Database, jobId: string): Promise<boolean> {
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `UPDATE jobs
       SET status = 'COMPLETED', updated_at = ?
       WHERE id = ?
         AND status = 'PROCESSING'
         AND NOT EXISTS (
           SELECT 1
           FROM job_items
           WHERE job_id = ?
             AND status NOT IN ('COMPLETED', 'FAILED')
         )`,
    )
    .bind(now, jobId, jobId)
    .run();

  return result.meta.changes > 0;
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
      `SELECT
         asin,
         ean,
         title,
         supplier_cost,
         pack_qty,
         adjusted_cost,
         spreadsheet_sales_price,
         amazon_buy_box,
         keepa_buy_box,
         validated_sales_price,
         amazon_fees_estimate,
         prep_fee,
         net_profit,
         roi_percent,
         keepa_rating,
         keepa_review_count,
         keepa_bsr_current,
         keepa_avg_bsr_30,
         keepa_avg_bsr_90,
         keepa_sales_rank_drops_30,
         keepa_sales_rank_drops_90,
         keepa_offer_count,
         keepa_seller_count,
         price_status,
         decision_status,
         notes
       FROM item_results
       WHERE job_id = ?
         AND net_profit > 0
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(jobId)
    .all<D1PublicItemResultRow>();

  return {
    jobId: status.jobId,
    status: status.status,
    results: results.results.map(mapPublicJobResult),
  };
}
