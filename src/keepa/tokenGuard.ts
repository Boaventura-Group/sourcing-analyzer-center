import { estimateKeepaMainProductTokens } from './client';

export type KeepaTokenBudgetInput = {
  asinCount: number;
  tokensLeft?: number | undefined;
  refillTokensPerMinute?: number | undefined;
};

export type KeepaTokenBudgetDecision =
  | {
      decision: 'READY';
      tokensLeft: number;
      requiredTokens: number;
    }
  | {
      decision: 'WAIT_FOR_TOKENS';
      tokensLeft: number;
      requiredTokens: number;
      retryAfterSeconds: number;
    };

export function evaluateKeepaTokenBudget(input: KeepaTokenBudgetInput): KeepaTokenBudgetDecision {
  const tokensLeft = input.tokensLeft ?? 300;
  const refillTokensPerMinute = input.refillTokensPerMinute ?? 5;
  const requiredTokens = estimateKeepaMainProductTokens(input.asinCount);

  if (tokensLeft >= requiredTokens) {
    return {
      decision: 'READY',
      tokensLeft,
      requiredTokens,
    };
  }

  if (refillTokensPerMinute <= 0) {
    throw new Error('Keepa refill rate must be positive when tokens are insufficient');
  }

  return {
    decision: 'WAIT_FOR_TOKENS',
    tokensLeft,
    requiredTokens,
    retryAfterSeconds: Math.ceil(((requiredTokens - tokensLeft) / refillTokensPerMinute) * 60),
  };
}
