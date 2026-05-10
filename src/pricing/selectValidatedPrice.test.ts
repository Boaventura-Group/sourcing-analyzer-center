import { describe, expect, it } from 'vitest';
import { selectValidatedPrice } from './selectValidatedPrice';

describe('selectValidatedPrice', () => {
  it('uses Amazon Buy Box and marks matched when Amazon and Keepa differ by 2 percent or less', () => {
    expect(selectValidatedPrice({ amazonBuyBox: 10, keepaBuyBox: 9.8 })).toMatchObject({
      validatedSalesPrice: 10,
      priceStatus: 'BUYBOX_MATCHED',
    });
  });

  it('uses rounded percentage when checking the mismatch threshold', () => {
    expect(selectValidatedPrice({ amazonBuyBox: 1, keepaBuyBox: 1.02 })).toMatchObject({
      amazonVsKeepaPct: 2,
      priceStatus: 'BUYBOX_MATCHED',
    });
  });

  it('uses Amazon Buy Box and marks review when Amazon and Keepa differ by more than 2 percent', () => {
    expect(selectValidatedPrice({ amazonBuyBox: 10, keepaBuyBox: 9 })).toMatchObject({
      validatedSalesPrice: 10,
      priceStatus: 'BUYBOX_MISMATCH_REVIEW',
    });
  });

  it('uses Keepa when Amazon Buy Box is absent', () => {
    expect(selectValidatedPrice({ keepaBuyBox: 11.25 })).toMatchObject({
      validatedSalesPrice: 11.25,
      priceStatus: 'AMAZON_BUYBOX_MISSING_USING_KEEPA',
    });
  });

  it('uses Amazon when Keepa Buy Box is absent', () => {
    expect(selectValidatedPrice({ amazonBuyBox: 12.5 })).toMatchObject({
      validatedSalesPrice: 12.5,
      priceStatus: 'KEEPA_BUYBOX_MISSING_USING_AMAZON',
    });
  });

  it('returns no validated price when both Buy Boxes are absent', () => {
    const result = selectValidatedPrice({});

    expect(result.priceStatus).toBe('NO_BUYBOX');
    expect(result.validatedSalesPrice).toBeUndefined();
  });
});
