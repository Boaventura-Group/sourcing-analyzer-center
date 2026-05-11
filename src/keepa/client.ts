import { sanitizeLogPayload } from '../utils/logger';
import type { KeepaConfig } from './config';

const DEFAULT_KEEPA_BASE_URL = 'https://api.keepa.com';
const MAIN_PRODUCT_TOKENS_PER_ASIN = 4;

export type KeepaTokenStatus = {
  tokensLeft: number;
  refillIn?: number | undefined;
  refillRate?: number | undefined;
};

export type KeepaProductResponse = {
  products: unknown[];
};

type KeepaProductRequestOptions = {
  offers?: number | undefined;
};

type KeepaClientDependencies = {
  fetch?: typeof globalThis.fetch | undefined;
  sleep?: ((durationMs: number) => Promise<void>) | undefined;
  attempts?: number | undefined;
};

function getBaseUrl(config: KeepaConfig): string {
  return config.baseUrl ?? DEFAULT_KEEPA_BASE_URL;
}

function assertAsinBatch(asins: string[], offers: number | undefined): void {
  if (asins.length === 0) {
    throw new Error('Keepa product requests require at least one ASIN');
  }

  if (offers !== undefined && asins.length > 20) {
    throw new Error('Keepa offers product requests support at most 20 ASINs');
  }

  if (offers === undefined && asins.length > 100) {
    throw new Error('Keepa product requests support at most 100 ASINs');
  }
}

function assertOffers(offers: number | undefined): void {
  if (offers === undefined) {
    return;
  }

  if (!Number.isInteger(offers) || offers < 20 || offers > 100) {
    throw new Error('Keepa offers must be an integer between 20 and 100');
  }
}

function buildKeepaUrl(config: KeepaConfig, path: string): URL {
  const url = new URL(path, getBaseUrl(config));
  url.searchParams.set('key', config.apiKey);
  return url;
}

export function buildKeepaProductUrl(
  config: KeepaConfig,
  asins: string[],
  options: KeepaProductRequestOptions = {},
): URL {
  const offers = options.offers;
  assertOffers(offers);
  assertAsinBatch(asins, offers);

  const url = buildKeepaUrl(config, '/product');
  url.searchParams.set('domain', String(config.domain));
  url.searchParams.set('asin', asins.join(','));
  url.searchParams.set('stats', '90');
  url.searchParams.set('rating', '1');
  url.searchParams.set('history', '0');

  if (offers === undefined) {
    url.searchParams.set('buybox', '1');
  } else {
    url.searchParams.set('offers', String(offers));
  }

  return url;
}

function buildKeepaTokenUrl(config: KeepaConfig): URL {
  return buildKeepaUrl(config, '/token');
}

export function estimateKeepaMainProductTokens(asinCount: number): number {
  if (!Number.isInteger(asinCount) || asinCount < 0) {
    throw new Error('ASIN count must be a non-negative integer');
  }

  return asinCount * MAIN_PRODUCT_TOKENS_PER_ASIN;
}

function redactKeepaUrl(url: URL): string {
  const redacted = new URL(url.toString());
  redacted.searchParams.set('key', '[REDACTED]');
  return redacted.toString();
}

function redactKnownSecretValues(value: string, secrets: string[]): string {
  return secrets.reduce((redacted, secret) => {
    if (secret.length === 0) {
      return redacted;
    }

    return redacted.split(secret).join('[REDACTED]');
  }, value);
}

function redactSensitiveKeyValuePairs(value: string): string {
  return value
    .replace(
      /(["']?(?:api[_-]?key|token|secret|credential|password)["']?\s*[:=]\s*["']?)([^"',\s};&]+)/gi,
      (_match, prefix: string) => `${prefix}[REDACTED]`,
    )
    .replace(
      /(\b(?:api[_-]?key|token|secret|credential|password)\s+)([^\s,;]+)/gi,
      (_match, prefix: string) => `${prefix}[REDACTED]`,
    );
}

function sanitizeText(value: string, url: URL): string {
  const knownSecrets = [url.searchParams.get('key') ?? ''];

  try {
    const parsed = JSON.parse(value) as unknown;
    return redactKnownSecretValues(JSON.stringify(sanitizeLogPayload(parsed)), knownSecrets);
  } catch {
    const sanitized = sanitizeLogPayload(value);
    const sanitizedText = typeof sanitized === 'string' ? sanitized : 'Unexpected Keepa response';
    return redactKnownSecretValues(redactSensitiveKeyValuePairs(sanitizedText), knownSecrets);
  }
}

export class KeepaHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(status: number, url: URL, body: string) {
    const safeUrl = redactKeepaUrl(url);
    const safeBody = sanitizeText(body, url);
    super(`Keepa HTTP ${status} for ${safeUrl}`);
    this.name = 'KeepaHttpError';
    this.status = status;
    this.url = safeUrl;
    this.body = safeBody;
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504);
}

async function defaultSleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getNumberField(payload: Record<string, unknown>, field: string): number | undefined {
  const value = payload[field];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function parseTokenStatus(payload: unknown): KeepaTokenStatus {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid Keepa token response');
  }

  const record = payload as Record<string, unknown>;
  const tokensLeft = getNumberField(record, 'tokensLeft');

  if (tokensLeft === undefined) {
    throw new Error('Invalid Keepa token response');
  }

  const result: KeepaTokenStatus = { tokensLeft };
  const refillIn = getNumberField(record, 'refillIn');
  const refillRate = getNumberField(record, 'refillRate');

  if (refillIn !== undefined) {
    result.refillIn = refillIn;
  }

  if (refillRate !== undefined) {
    result.refillRate = refillRate;
  }

  return result;
}

function parseProductResponse(payload: unknown): KeepaProductResponse {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid Keepa product response');
  }

  const products = (payload as Record<string, unknown>).products;

  if (!Array.isArray(products)) {
    throw new Error('Invalid Keepa product response');
  }

  return { products };
}

export function createKeepaClient(config: KeepaConfig, dependencies: KeepaClientDependencies = {}) {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? defaultSleep;
  const attempts = dependencies.attempts ?? 3;

  async function getJson(url: URL): Promise<unknown> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip',
          'user-agent': 'sourcing-analyzer-center/0.1',
        },
      });

      if (response.ok) {
        return response.json();
      }

      const body = await response.text();

      if (isTransientStatus(response.status) && attempt < attempts) {
        await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
        continue;
      }

      throw new KeepaHttpError(response.status, url, body);
    }

    throw new Error('Keepa request attempts exhausted');
  }

  return {
    async getTokenStatus(): Promise<KeepaTokenStatus> {
      return parseTokenStatus(await getJson(buildKeepaTokenUrl(config)));
    },

    async getProducts(asins: string[], options?: KeepaProductRequestOptions): Promise<KeepaProductResponse> {
      return parseProductResponse(await getJson(buildKeepaProductUrl(config, asins, options)));
    },
  };
}
