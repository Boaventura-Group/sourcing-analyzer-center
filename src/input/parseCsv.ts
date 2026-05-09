import { parse } from 'csv-parse/sync';
import type { CreateJobRequest } from '../jobs/types';
import {
  normalizeSupplierItems,
  SupplierInputValidationError,
} from './normalizeSupplierItems';

type SupplierCsvRecord = Record<string, unknown>;

function csvParseError(): SupplierInputValidationError {
  return new SupplierInputValidationError([
    {
      code: 'custom',
      path: ['csv'],
      message: 'CSV body must be valid and include a header row',
    },
  ]);
}

export function parseCsvCreateJobRequest(csv: string): CreateJobRequest {
  let records: SupplierCsvRecord[];

  try {
    records = parse(csv, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as SupplierCsvRecord[];
  } catch {
    throw csvParseError();
  }

  if (!Array.isArray(records)) {
    throw csvParseError();
  }

  return {
    items: normalizeSupplierItems(records),
  };
}
