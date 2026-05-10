import { describe, expect, it } from 'vitest';
import { decisionStatus } from './decisionStatus';

describe('decisionStatus', () => {
  it('marks positive profit as profitable', () => {
    expect(decisionStatus({ netProfit: 0.01 })).toBe('PROFIT_POSITIVE');
  });

  it('marks zero or negative profit as not profitable', () => {
    expect(decisionStatus({ netProfit: 0 })).toBe('NOT_PROFITABLE');
    expect(decisionStatus({ netProfit: -1 })).toBe('NOT_PROFITABLE');
  });

  it('marks missing validated price as skipped without Buy Box', () => {
    expect(decisionStatus({ hasValidatedSalesPrice: false })).toBe('SKIPPED_NO_BUYBOX');
  });

  it('marks missing fees as skipped without fees', () => {
    expect(decisionStatus({ hasValidatedSalesPrice: true, hasFees: false })).toBe(
      'SKIPPED_NO_FEES',
    );
  });

  it('marks calculation errors as error', () => {
    expect(decisionStatus({ hasCalculationError: true })).toBe('ERROR');
  });
});
