import type { ZodIssue } from 'zod';
import type { SupplierItemInput } from '../jobs/types';

type SupplierCsvRecord = Record<string, unknown>;

const MAX_ITEMS_PER_JOB = 100;

const COLUMN_ALIASES = {
  asin: new Set(['asin']),
  ean: new Set(['ean', 'ean13', 'barcode', 'eancode']),
  title: new Set([
    'title',
    'description',
    'producttitle',
    'productdescription',
    'suppliertitle',
    'itemtitle',
  ]),
  cost: new Set(['cost', 'costprice', 'suppliercost', 'buyprice', 'purchaseprice']),
  salesPrice: new Set(['salesprice', 'saleprice', 'sellingprice', 'sellprice', 'retailprice']),
} as const;

export class SupplierInputValidationError extends Error {
  constructor(readonly issues: ZodIssue[]) {
    super('Invalid supplier input');
  }
}

function issue(path: Array<string | number>, message: string): ZodIssue {
  return {
    code: 'custom',
    path,
    message,
  };
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function recordValue(record: SupplierCsvRecord, aliases: ReadonlySet<string>): string | undefined {
  for (const [header, value] of Object.entries(record)) {
    if (!aliases.has(normalizeHeader(header))) {
      continue;
    }

    const text = String(value ?? '').trim();
    return text.length > 0 ? text : undefined;
  }

  return undefined;
}

function parseMoney(value: string | undefined, path: Array<string | number>, label: string): number {
  if (!value) {
    throw new SupplierInputValidationError([issue(path, `${label} is required`)]);
  }

  const compact = value.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');

  if (compact.length === 0 || compact === '-' || compact === '.' || compact === ',') {
    throw new SupplierInputValidationError([issue(path, `${label} must be a valid decimal`)]);
  }

  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalSeparator =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? ','
        : '.'
      : lastComma >= 0
        ? ','
        : '.';
  const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
  const normalized = compact
    .replaceAll(thousandsSeparator, '')
    .replaceAll(decimalSeparator, '.');
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SupplierInputValidationError([issue(path, `${label} must be a positive decimal`)]);
  }

  return amount;
}

function optionalMoney(
  value: string | undefined,
  path: Array<string | number>,
  label: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  return parseMoney(value, path, label);
}

function duplicateKey(item: SupplierItemInput): string {
  return [item.asin, item.ean ?? '', item.supplierCost.toFixed(6)].join('|');
}

export function normalizeSupplierItems(records: SupplierCsvRecord[]): SupplierItemInput[] {
  const normalizedItems: SupplierItemInput[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const asin = recordValue(record, COLUMN_ALIASES.asin)?.replace(/\s/g, '').toUpperCase();
    const ean = recordValue(record, COLUMN_ALIASES.ean);
    const supplierTitle = recordValue(record, COLUMN_ALIASES.title);
    const supplierCost = parseMoney(
      recordValue(record, COLUMN_ALIASES.cost),
      [index, 'supplierCost'],
      'Cost price',
    );
    const spreadsheetSalesPrice = optionalMoney(
      recordValue(record, COLUMN_ALIASES.salesPrice),
      [index, 'spreadsheetSalesPrice'],
      'Sales price',
    );

    if (!asin) {
      throw new SupplierInputValidationError([issue([index, 'asin'], 'ASIN is required')]);
    }

    const item: SupplierItemInput = {
      asin,
      supplierCost,
    };

    if (ean) {
      item.ean = ean;
    }

    if (supplierTitle) {
      item.supplierTitle = supplierTitle;
    }

    if (spreadsheetSalesPrice !== undefined) {
      item.spreadsheetSalesPrice = spreadsheetSalesPrice;
    }

    const key = duplicateKey(item);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalizedItems.push(item);

    if (normalizedItems.length > MAX_ITEMS_PER_JOB) {
      throw new SupplierInputValidationError([
        issue([rowNumber], `A job can include at most ${MAX_ITEMS_PER_JOB} items`),
      ]);
    }
  });

  if (normalizedItems.length === 0) {
    throw new SupplierInputValidationError([issue(['items'], 'At least one supplier item is required')]);
  }

  return normalizedItems;
}
