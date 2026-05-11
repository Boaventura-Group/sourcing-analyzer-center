import { sanitizeLogPayload } from '../utils/logger';
import type { AmazonConfig } from './config';
import { createLwaClient } from './lwa';
import type { AmazonAccessToken } from './lwa';

const USER_AGENT = 'sourcing-analyzer-center/0.1 (Language=TypeScript)';
const COMPETITIVE_SUMMARY_PATH = '/batches/products/pricing/2022-05-01/items/competitiveSummary';
const COMPETITIVE_SUMMARY_URI = '/products/pricing/2022-05-01/items/competitiveSummary';
const FEES_ESTIMATES_PATH = '/products/fees/v0/feesEstimate';
export type AmazonFeesEstimateInput = {
  asin: string;
  listingPrice: number;
  identifier?: string | undefined;
};

type AmazonSpApiClientDependencies = {
  fetch?: typeof globalThis.fetch | undefined;
  getAccessToken?: (() => Promise<AmazonAccessToken>) | undefined;
  sleep?: ((durationMs: number) => Promise<void>) | undefined;
  nowMs?: (() => number) | undefined;
  attempts?: number | undefined;
};

async function defaultSleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function buildAmazonUrl(config: AmazonConfig, path: string): URL {
  return new URL(path, config.endpoint);
}

function assertAsinBatch(asins: string[]): void {
  if (asins.length === 0) {
    throw new Error('Amazon competitive summary requests require at least one ASIN');
  }

  if (asins.length > 20) {
    throw new Error('Amazon competitive summary requests support at most 20 ASINs');
  }
}

function assertFeesBatch(items: AmazonFeesEstimateInput[]): void {
  if (items.length === 0) {
    throw new Error('Amazon fees estimate requests require at least one item');
  }

  if (items.length > 20) {
    throw new Error('Amazon fees estimate requests support at most 20 items');
  }

  for (const item of items) {
    if (!Number.isFinite(item.listingPrice) || item.listingPrice <= 0) {
      throw new Error('Amazon fees estimate listing price must be positive');
    }
  }
}

function formatAmzDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504);
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');

  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.round(retryAfterSeconds * 1_000);
    }
  }

  return Math.min(8_000, 500 * 2 ** (attempt - 1));
}

function redactKnownSecretValues(value: string, secrets: string[]): string {
  return secrets.reduce((redacted, secret) => {
    if (secret.length === 0) {
      return redacted;
    }

    return redacted.split(secret).join('[REDACTED]');
  }, value);
}

function sanitizeText(value: string, secrets: string[]): string {
  try {
    return redactKnownSecretValues(JSON.stringify(sanitizeLogPayload(JSON.parse(value) as unknown)), secrets);
  } catch {
    const sanitized = sanitizeLogPayload(value);
    return redactKnownSecretValues(typeof sanitized === 'string' ? sanitized : 'Unexpected Amazon SP-API response', secrets);
  }
}

export class AmazonSpApiHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(status: number, url: URL, body: string, secrets: string[]) {
    super(`Amazon SP-API HTTP ${status} for ${url.toString()}`);
    this.name = 'AmazonSpApiHttpError';
    this.status = status;
    this.url = url.toString();
    this.body = sanitizeText(body, secrets);
  }
}

export function createAmazonSpApiClient(
  config: AmazonConfig,
  dependencies: AmazonSpApiClientDependencies = {},
) {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? defaultSleep;
  const nowMs = dependencies.nowMs ?? Date.now;
  const attempts = dependencies.attempts ?? 3;
  const getAccessToken = dependencies.getAccessToken ?? createLwaClient(config, { fetch: fetchImpl, nowMs }).getAccessToken;

  async function postJson(url: URL, payload: unknown): Promise<unknown> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const token = await getAccessToken();
      const response = await fetchImpl(url.toString(), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-amz-access-token': token.accessToken,
          'x-amz-date': formatAmzDate(nowMs()),
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return response.json();
      }

      const body = await response.text();

      if (isTransientStatus(response.status) && attempt < attempts) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      throw new AmazonSpApiHttpError(response.status, url, body, [
        token.accessToken,
        config.refreshToken,
        config.clientSecret,
      ]);
    }

    throw new Error('Amazon SP-API request attempts exhausted');
  }

  return {
    async getCompetitiveSummary(asins: string[]): Promise<unknown> {
      assertAsinBatch(asins);

      return postJson(buildAmazonUrl(config, COMPETITIVE_SUMMARY_PATH), {
        requests: asins.map((asin) => ({
          method: 'GET',
          uri: COMPETITIVE_SUMMARY_URI,
          asin,
          marketplaceId: config.marketplaceId,
          includedData: ['featuredBuyingOptions', 'lowestPricedOffers', 'referencePrices'],
        })),
      });
    },

    async getMyFeesEstimates(items: AmazonFeesEstimateInput[]): Promise<unknown> {
      assertFeesBatch(items);

      return postJson(
        buildAmazonUrl(config, FEES_ESTIMATES_PATH),
        items.map((item) => ({
          FeesEstimateRequest: {
            MarketplaceId: config.marketplaceId,
            IsAmazonFulfilled: true,
            PriceToEstimateFees: {
              ListingPrice: {
                CurrencyCode: config.currencyCode,
                Amount: item.listingPrice,
              },
            },
            Identifier: item.identifier ?? item.asin,
          },
          IdType: 'ASIN',
          IdValue: item.asin,
        })),
      );
    },
  };
}
