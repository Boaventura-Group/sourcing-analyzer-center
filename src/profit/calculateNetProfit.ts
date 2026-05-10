import { decisionStatus } from './decisionStatus';
import type { DecisionStatus } from './types';

const DEFAULT_PREP_FEE = 0.55;

export type CalculateNetProfitInput = {
  validatedSalesPrice?: number;
  adjustedCost: number;
  amazonFeesEstimate?: number;
  prepFee?: number;
};

export type CalculateNetProfitResult =
  | {
      status: 'OK';
      validatedSalesPrice: number;
      adjustedCost: number;
      amazonFeesEstimate: number;
      prepFee: number;
      netProfit: number;
      decisionStatus: DecisionStatus;
      notes: string[];
    }
  | {
      status: 'MISSING_PRICE' | 'MISSING_FEES' | 'ERROR';
      prepFee: number;
      decisionStatus: DecisionStatus;
      notes: string[];
    };

function isPositiveMoney(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidMoney(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateNetProfit(input: CalculateNetProfitInput): CalculateNetProfitResult {
  const prepFee = input.prepFee ?? DEFAULT_PREP_FEE;

  if (!isValidMoney(prepFee) || !isValidMoney(input.adjustedCost)) {
    return {
      status: 'ERROR',
      prepFee: isValidMoney(prepFee) ? prepFee : DEFAULT_PREP_FEE,
      decisionStatus: 'ERROR',
      notes: ['Invalid cost or prep fee for net profit calculation'],
    };
  }

  if (!isPositiveMoney(input.validatedSalesPrice)) {
    return {
      status: 'MISSING_PRICE',
      prepFee,
      decisionStatus: decisionStatus({ hasValidatedSalesPrice: false }),
      notes: ['Validated sales price is required to calculate net profit'],
    };
  }

  if (!isValidMoney(input.amazonFeesEstimate)) {
    return {
      status: 'MISSING_FEES',
      prepFee,
      decisionStatus: decisionStatus({
        hasValidatedSalesPrice: true,
        hasFees: false,
      }),
      notes: ['Amazon fees estimate is required to calculate net profit'],
    };
  }

  const netProfit = roundMoney(
    input.validatedSalesPrice - input.adjustedCost - input.amazonFeesEstimate - prepFee,
  );

  return {
    status: 'OK',
    validatedSalesPrice: input.validatedSalesPrice,
    adjustedCost: input.adjustedCost,
    amazonFeesEstimate: input.amazonFeesEstimate,
    prepFee,
    netProfit,
    decisionStatus: decisionStatus({ netProfit }),
    notes: [],
  };
}
