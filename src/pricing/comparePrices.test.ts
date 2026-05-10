import { describe, expect, it } from 'vitest';
import { comparePrices } from './comparePrices';

describe('comparePrices', () => {
  it('marks divergences above 2 percent', () => {
    const result = comparePrices({
      spreadsheetSalesPrice: 12,
      amazonBuyBox: 10,
      keepaBuyBox: 9,
    });

    expect(result.spreadsheetVsAmazon).toMatchObject({ percent: 20, isDivergent: true });
    expect(result.amazonVsKeepa).toMatchObject({ isDivergent: true });
    expect(result.hasDivergence).toBe(true);
  });

  it('does not mark divergences equal to or below 2 percent', () => {
    const result = comparePrices({
      spreadsheetSalesPrice: 10.2,
      amazonBuyBox: 10,
      keepaBuyBox: 10,
    });

    expect(result.spreadsheetVsAmazon).toMatchObject({ percent: 2, isDivergent: false });
    expect(result.amazonVsKeepa).toMatchObject({ percent: 0, isDivergent: false });
    expect(result.hasDivergence).toBe(false);
  });

  it('does not divide by zero or missing references', () => {
    const result = comparePrices({
      spreadsheetSalesPrice: 10,
      amazonBuyBox: 0,
    });

    expect(result.spreadsheetVsAmazon).toBeUndefined();
    expect(result.amazonVsKeepa).toBeUndefined();
    expect(result.hasDivergence).toBe(false);
  });
});
