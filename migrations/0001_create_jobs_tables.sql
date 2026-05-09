CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  source_file_name TEXT,
  total_items INTEGER NOT NULL CHECK (total_items >= 0),
  processed_items INTEGER NOT NULL DEFAULT 0 CHECK (processed_items >= 0),
  profitable_items INTEGER NOT NULL DEFAULT 0 CHECK (profitable_items >= 0),
  error_items INTEGER NOT NULL DEFAULT 0 CHECK (error_items >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  ean TEXT,
  asin TEXT NOT NULL,
  supplier_title TEXT,
  amazon_title TEXT,
  supplier_cost REAL NOT NULL,
  spreadsheet_sales_price REAL,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_item_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  ean TEXT,
  title TEXT,
  pack_qty INTEGER,
  supplier_cost REAL,
  adjusted_cost REAL,
  spreadsheet_sales_price REAL,
  amazon_buy_box REAL,
  keepa_buy_box REAL,
  validated_sales_price REAL,
  amazon_fees_estimate REAL,
  prep_fee REAL,
  net_profit REAL,
  roi_percent REAL,
  keepa_rating REAL,
  keepa_review_count INTEGER,
  keepa_bsr_current INTEGER,
  keepa_avg_bsr_30 INTEGER,
  keepa_avg_bsr_90 INTEGER,
  keepa_sales_rank_drops_30 INTEGER,
  keepa_sales_rank_drops_90 INTEGER,
  keepa_offer_count INTEGER,
  keepa_seller_count INTEGER,
  price_status TEXT,
  decision_status TEXT,
  notes TEXT,
  raw_amazon_pricing_json TEXT,
  raw_amazon_fees_estimate_json TEXT,
  raw_keepa_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (job_item_id) REFERENCES job_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_asin ON job_items(asin);
CREATE INDEX IF NOT EXISTS idx_item_results_job_id ON item_results(job_id);
CREATE INDEX IF NOT EXISTS idx_item_results_job_item_id ON item_results(job_item_id);
