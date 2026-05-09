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

    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function areThousandsGroups(parts: string[]): boolean {
  const [firstPart, ...remainingParts] = parts;

  return (
    firstPart !== undefined &&
    /^\d{1,3}$/.test(firstPart) &&
    remainingParts.length > 0 &&
    remainingParts.every((part) => /^\d{3}$/.test(part))
  );
}

function normalizeMoneyText(value: string): string | null {
  const sign = value.startsWith('-') ? '-' : '';
  const unsigned = sign ? value.slice(1) : value;

  if (unsigned.length === 0 || unsigned.includes('-') || !/^[0-9,.]+$/.test(unsigned)) {
    return null;
  }

  const commaCount = countOccurrences(unsigned, ',');
  const dotCount = countOccurrences(unsigned, '.');

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = unsigned.lastIndexOf(',') > unsigned.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    const [integerPart, decimalPart, ...extraParts] = unsigned.split(decimalSeparator);

    if (
      integerPart === undefined ||
      decimalPart === undefined ||
      extraParts.length > 0 ||
      !/^\d+$/.test(decimalPart) ||
      !areThousandsGroups(integerPart.split(thousandsSeparator))
    ) {
      return null;
    }

    return `${sign}${integerPart.replaceAll(thousandsSeparator, '')}.${decimalPart}`;
  }

  if (commaCount > 0 || dotCount > 0) {
    const separator = commaCount > 0 ? ',' : '.';
    const parts = unsigned.split(separator);

    if (parts.length === 2) {
      const [integerPart, suffix] = parts;

      if (integerPart === undefined || suffix === undefined || !/^\d+$/.test(integerPart)) {
        return null;
      }

      if (/^\d{3}$/.test(suffix)) {
        return `${sign}${integerPart}${suffix}`;
      }

      if (/^\d{1,2}$/.test(suffix)) {
        return `${sign}${integerPart}.${suffix}`;
      }

      return null;
    }

    if (areThousandsGroups(parts)) {
      return `${sign}${parts.join('')}`;
    }

    return null;
  }

  return /^\d+$/.test(unsigned) ? `${sign}${unsigned}` : null;
}

function parseMoney(value: string | undefined, path: Array<string | number>, label: string): number {
  if (!value) {
    throw new SupplierInputValidationError([issue(path, `${label} is required`)]);
  }

  const compact = value.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  const normalized = normalizeMoneyText(compact);

  if (normalized === null) {
    throw new SupplierInputValidationError([issue(path, `${label} must be a valid decimal`)]);
  }

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
