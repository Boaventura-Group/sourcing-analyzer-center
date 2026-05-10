import type { DecisionStatus } from './types';

export type CalculateRoiInput = {
  netProfit: number;
  adjustedCost: number;
};

export type CalculateRoiResult =
  | {
      status: 'OK';
      roiPercent: number;
      notes: string[];
    }
  | {
      status: 'INVALID_ADJUSTED_COST' | 'ERROR';
      decisionStatus: DecisionStatus;
      notes: string[];
    };

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateRoi(input: CalculateRoiInput): CalculateRoiResult {
  if (!Number.isFinite(input.netProfit)) {
    return {
      status: 'ERROR',
      decisionStatus: 'ERROR',
      notes: ['Net profit is required to calculate ROI'],
    };
  }

  if (!Number.isFinite(input.adjustedCost) || input.adjustedCost <= 0) {
    return {
      status: 'INVALID_ADJUSTED_COST',
      decisionStatus: 'ERROR',
      notes: ['Adjusted cost must be greater than zero to calculate ROI'],
    };
  }

  return {
    status: 'OK',
    roiPercent: roundPercent((input.netProfit / input.adjustedCost) * 100),
    notes: [],
  };
}
