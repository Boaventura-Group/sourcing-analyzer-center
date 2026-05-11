import { describe, expect, it } from 'vitest';
import { evaluateKeepaTokenBudget } from './tokenGuard';

describe('evaluateKeepaTokenBudget', () => {
  it('allows a product block when tokens cover the estimated cost', () => {
    expect(evaluateKeepaTokenBudget({ tokensLeft: 80, asinCount: 20 })).toEqual({
      decision: 'READY',
      tokensLeft: 80,
      requiredTokens: 80,
    });
  });

  it('returns a retry delay when tokens are insufficient', () => {
    expect(evaluateKeepaTokenBudget({ tokensLeft: 300, asinCount: 100, refillTokensPerMinute: 5 })).toEqual({
      decision: 'WAIT_FOR_TOKENS',
      tokensLeft: 300,
      requiredTokens: 400,
      retryAfterSeconds: 1200,
    });
  });

  it('uses the project operational defaults when not supplied', () => {
    expect(evaluateKeepaTokenBudget({ asinCount: 75 })).toEqual({
      decision: 'READY',
      tokensLeft: 300,
      requiredTokens: 300,
    });
  });
});
