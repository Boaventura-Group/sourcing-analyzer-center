import { PRICE_MISMATCH_THRESHOLD_PERCENT, type PriceStatus } from './types';

export type SelectValidatedPriceInput = {
  amazonBuyBox?: number;
  keepaBuyBox?: number;
  thresholdPercent?: number;
};

export type SelectValidatedPriceResult = {
  validatedSalesPrice?: number;
  priceStatus: PriceStatus;
  notes: string[];
  amazonVsKeepaPct?: number;
};

function isUsablePrice(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentDifference(candidate: number, reference: number): number {
  return ((candidate - reference) / reference) * 100;
}

export function selectValidatedPrice(input: SelectValidatedPriceInput): SelectValidatedPriceResult {
  const threshold = input.thresholdPercent ?? PRICE_MISMATCH_THRESHOLD_PERCENT;
  const amazonBuyBox = input.amazonBuyBox;
  const keepaBuyBox = input.keepaBuyBox;
  const hasAmazonBuyBox = isUsablePrice(amazonBuyBox);
  const hasKeepaBuyBox = isUsablePrice(keepaBuyBox);

  if (hasAmazonBuyBox && hasKeepaBuyBox) {
    const amazonVsKeepaPct = percentDifference(keepaBuyBox, amazonBuyBox);
    const priceStatus: PriceStatus =
      Math.abs(amazonVsKeepaPct) > threshold ? 'BUYBOX_MISMATCH_REVIEW' : 'BUYBOX_MATCHED';
    const notes =
      priceStatus === 'BUYBOX_MISMATCH_REVIEW'
        ? ['Amazon and Keepa Buy Box prices differ by more than 2 percent']
        : [];

    return {
      validatedSalesPrice: amazonBuyBox,
      priceStatus,
      notes,
      amazonVsKeepaPct: roundPercent(amazonVsKeepaPct),
    };
  }

  if (hasAmazonBuyBox) {
    return {
      validatedSalesPrice: amazonBuyBox,
      priceStatus: 'KEEPA_BUYBOX_MISSING_USING_AMAZON',
      notes: ['Keepa Buy Box missing; using Amazon Buy Box'],
    };
  }

  if (hasKeepaBuyBox) {
    return {
      validatedSalesPrice: keepaBuyBox,
      priceStatus: 'AMAZON_BUYBOX_MISSING_USING_KEEPA',
      notes: ['Amazon Buy Box missing; using Keepa Buy Box'],
    };
  }

  return {
    priceStatus: 'NO_BUYBOX',
    notes: ['No Amazon or Keepa Buy Box price available'],
  };
}
