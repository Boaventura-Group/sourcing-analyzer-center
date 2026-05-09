import { describe, expect, it } from 'vitest';
import { createJobRequestSchema } from './types';

const validItem = {
  asin: 'b000test01',
  supplierCost: 12.5,
};

describe('createJobRequestSchema', () => {
  it('normalizes ASIN values to uppercase', () => {
    const parsed = createJobRequestSchema.parse({ items: [validItem] });

    expect(parsed.items[0]?.asin).toBe('B000TEST01');
  });

  it('rejects an empty item list', () => {
    const result = createJobRequestSchema.safeParse({ items: [] });

    expect(result.success).toBe(false);
  });

  it('rejects more than 100 items', () => {
    const result = createJobRequestSchema.safeParse({
      items: Array.from({ length: 101 }, () => validItem),
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid ASIN values and non-positive prices', () => {
    const result = createJobRequestSchema.safeParse({
      items: [
        {
          asin: 'invalid',
          supplierCost: 0,
          spreadsheetSalesPrice: -1,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
