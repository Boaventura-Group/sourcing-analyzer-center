import type { DecisionStatus } from './types';

export type DecisionStatusInput = {
  netProfit?: number;
  hasValidatedSalesPrice?: boolean;
  hasFees?: boolean;
  hasCalculationError?: boolean;
};

export function decisionStatus(input: DecisionStatusInput): DecisionStatus {
  if (input.hasCalculationError === true) {
    return 'ERROR';
  }

  if (input.hasValidatedSalesPrice === false) {
    return 'SKIPPED_NO_BUYBOX';
  }

  if (input.hasFees === false) {
    return 'SKIPPED_NO_FEES';
  }

  if (typeof input.netProfit !== 'number' || !Number.isFinite(input.netProfit)) {
    return 'ERROR';
  }

  return input.netProfit > 0 ? 'PROFIT_POSITIVE' : 'NOT_PROFITABLE';
}
