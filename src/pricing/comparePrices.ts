import { PRICE_MISMATCH_THRESHOLD_PERCENT } from './types';

export type ComparePricesInput = {
  spreadsheetSalesPrice?: number;
  amazonBuyBox?: number;
  keepaBuyBox?: number;
  thresholdPercent?: number;
};

export type PriceComparison = {
  percent: number;
  isDivergent: boolean;
};

export type ComparePricesResult = {
  spreadsheetVsAmazon?: PriceComparison;
  spreadsheetVsKeepa?: PriceComparison;
  amazonVsKeepa?: PriceComparison;
  hasDivergence: boolean;
  notes: string[];
};

function isPresentNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function canUseReference(value: number | undefined): value is number {
  return isPresentNumber(value) && value > 0;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compare(
  candidate: number | undefined,
  reference: number | undefined,
  threshold: number,
): PriceComparison | undefined {
  if (!isPresentNumber(candidate) || !canUseReference(reference)) {
    return undefined;
  }

  const percent = ((candidate - reference) / reference) * 100;

  return {
    percent: roundPercent(percent),
    isDivergent: Math.abs(percent) > threshold,
  };
}

export function comparePrices(input: ComparePricesInput): ComparePricesResult {
  const threshold = input.thresholdPercent ?? PRICE_MISMATCH_THRESHOLD_PERCENT;
  const spreadsheetVsAmazon = compare(
    input.spreadsheetSalesPrice,
    input.amazonBuyBox,
    threshold,
  );
  const spreadsheetVsKeepa = compare(input.spreadsheetSalesPrice, input.keepaBuyBox, threshold);
  const amazonVsKeepa = compare(input.amazonBuyBox, input.keepaBuyBox, threshold);
  const comparisons = [spreadsheetVsAmazon, spreadsheetVsKeepa, amazonVsKeepa];
  const hasDivergence = comparisons.some((comparison) => comparison?.isDivergent === true);
  const result: ComparePricesResult = {
    hasDivergence,
    notes: hasDivergence ? ['One or more price comparisons differ by more than 2 percent'] : [],
  };

  if (spreadsheetVsAmazon !== undefined) {
    result.spreadsheetVsAmazon = spreadsheetVsAmazon;
  }

  if (spreadsheetVsKeepa !== undefined) {
    result.spreadsheetVsKeepa = spreadsheetVsKeepa;
  }

  if (amazonVsKeepa !== undefined) {
    result.amazonVsKeepa = amazonVsKeepa;
  }

  return result;
}
