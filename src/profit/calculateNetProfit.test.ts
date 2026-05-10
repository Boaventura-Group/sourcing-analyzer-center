import { describe, expect, it } from 'vitest';
import { calculateNetProfit } from './calculateNetProfit';

describe('calculateNetProfit', () => {
  it('calculates positive net profit', () => {
    expect(
      calculateNetProfit({
        validatedSalesPrice: 20,
        adjustedCost: 10,
        amazonFeesEstimate: 3,
        prepFee: 0.5,
      }),
    ).toMatchObject({
      status: 'OK',
      netProfit: 6.5,
      decisionStatus: 'PROFIT_POSITIVE',
    });
  });

  it('calculates negative net profit', () => {
    expect(
      calculateNetProfit({
        validatedSalesPrice: 10,
        adjustedCost: 9,
        amazonFeesEstimate: 1,
        prepFee: 0.55,
      }),
    ).toMatchObject({
      status: 'OK',
      netProfit: -0.55,
      decisionStatus: 'NOT_PROFITABLE',
    });
  });

  it('uses the default prep fee', () => {
    expect(
      calculateNetProfit({
        validatedSalesPrice: 20,
        adjustedCost: 10,
        amazonFeesEstimate: 3,
      }),
    ).toMatchObject({
      prepFee: 0.55,
      netProfit: 6.45,
    });
  });

  it('returns a controlled status when fees are missing', () => {
    expect(
      calculateNetProfit({
        validatedSalesPrice: 20,
        adjustedCost: 10,
      }),
    ).toMatchObject({
      status: 'MISSING_FEES',
      decisionStatus: 'SKIPPED_NO_FEES',
    });
  });
});
