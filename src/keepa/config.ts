export type KeepaConfig = {
  apiKey: string;
  domain: number;
  initialOperationalTokens?: number;
  refillTokensPerMinute?: number;
  baseUrl?: string;
};

type KeepaEnv = {
  KEEPA_API_KEY?: string | undefined;
  KEEPA_DOMAIN?: string | undefined;
  KEEPA_INITIAL_OPERATIONAL_TOKENS?: string | undefined;
  KEEPA_REFILL_TOKENS_PER_MINUTE?: string | undefined;
};

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Keepa numeric configuration values must be positive numbers');
  }

  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = parsePositiveNumber(value, fallback);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function createKeepaConfig(env: KeepaEnv): Required<Omit<KeepaConfig, 'baseUrl'>> {
  const apiKey = env.KEEPA_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('KEEPA_API_KEY is required');
  }

  return {
    apiKey,
    domain: parsePositiveInteger(env.KEEPA_DOMAIN, 2, 'KEEPA_DOMAIN'),
    initialOperationalTokens: parsePositiveNumber(env.KEEPA_INITIAL_OPERATIONAL_TOKENS, 300),
    refillTokensPerMinute: parsePositiveNumber(env.KEEPA_REFILL_TOKENS_PER_MINUTE, 5),
  };
}
