import { describe, expect, it } from 'vitest';
import { calculateRoi } from './calculateRoi';

describe('calculateRoi', () => {
  it('calculates positive ROI', () => {
    expect(calculateRoi({ netProfit: 5, adjustedCost: 10 })).toMatchObject({
      status: 'OK',
      roiPercent: 50,
    });
  });

  it('calculates negative ROI', () => {
    expect(calculateRoi({ netProfit: -2.5, adjustedCost: 10 })).toMatchObject({
      status: 'OK',
      roiPercent: -25,
    });
  });

  it('returns a controlled status when adjusted cost is not positive', () => {
    expect(calculateRoi({ netProfit: 5, adjustedCost: 0 })).toMatchObject({
      status: 'INVALID_ADJUSTED_COST',
      decisionStatus: 'ERROR',
    });
  });
});
