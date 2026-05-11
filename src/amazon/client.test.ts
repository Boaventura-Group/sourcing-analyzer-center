import { describe, expect, it } from 'vitest';
import { AmazonSpApiHttpError, createAmazonSpApiClient } from './client';
import type { AmazonAccessToken } from './lwa';
import type { AmazonConfig } from './config';

const config: AmazonConfig = {
  clientId: 'lwa-client-id',
  clientSecret: 'lwa-client-secret',
  refreshToken: 'lwa-refresh-token',
  region: 'eu-west-1',
  endpoint: 'https://sellingpartnerapi-eu.amazon.com',
  marketplaceId: 'A1F83G8C2ARO7P',
};

const validToken: AmazonAccessToken = {
  accessToken: 'sp-api-access-token',
  expiresAtMs: 9_999_999,
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('createAmazonSpApiClient', () => {
  it('sends getCompetitiveSummary batches using the SDD Product Pricing contract', async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init = {}) => {
      requests.push({ input: String(input), init });
      return jsonResponse({ responses: [{ asin: 'B000TEST01' }] });
    };
    const client = createAmazonSpApiClient(config, {
      fetch,
      getAccessToken: async () => validToken,
      nowMs: () => Date.UTC(2026, 4, 11, 3, 4, 5),
    });

    await expect(client.getCompetitiveSummary(['B000TEST01', 'B000TEST02'])).resolves.toEqual({
      responses: [{ asin: 'B000TEST01' }],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(
      'https://sellingpartnerapi-eu.amazon.com/batches/products/pricing/2022-05-01/items/competitiveSummary',
    );
    expect(requests[0]?.init.method).toBe('POST');

    const headers = new Headers(requests[0]?.init.headers);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-amz-access-token')).toBe('sp-api-access-token');
    expect(headers.get('x-amz-date')).toBe('20260511T030405Z');
    expect(headers.get('user-agent')).toBe('sourcing-analyzer-center/0.1 (Language=TypeScript)');

    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      requests: [
        {
          method: 'GET',
          uri: '/products/pricing/2022-05-01/items/competitiveSummary',
          asin: 'B000TEST01',
          marketplaceId: 'A1F83G8C2ARO7P',
          includedData: ['featuredBuyingOptions', 'lowestPricedOffers', 'referencePrices'],
        },
        {
          method: 'GET',
          uri: '/products/pricing/2022-05-01/items/competitiveSummary',
          asin: 'B000TEST02',
          marketplaceId: 'A1F83G8C2ARO7P',
          includedData: ['featuredBuyingOptions', 'lowestPricedOffers', 'referencePrices'],
        },
      ],
    });
  });

  it('rejects invalid getCompetitiveSummary batch sizes', async () => {
    const client = createAmazonSpApiClient(config, { getAccessToken: async () => validToken });

    await expect(client.getCompetitiveSummary([])).rejects.toThrow(
      'Amazon competitive summary requests require at least one ASIN',
    );
    await expect(client.getCompetitiveSummary(Array.from({ length: 21 }, (_, index) => `B000T${String(index).padStart(5, '0')}`))).rejects.toThrow(
      'Amazon competitive summary requests support at most 20 ASINs',
    );
  });

  it('sends getMyFeesEstimates batches using GBP ASIN fee estimate requests', async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init = {}) => {
      requests.push({ input: String(input), init });
      return jsonResponse([{ Status: 'Success' }]);
    };
    const client = createAmazonSpApiClient(config, {
      fetch,
      getAccessToken: async () => validToken,
    });

    await expect(
      client.getMyFeesEstimates([
        { asin: 'B000TEST01', listingPrice: 9.99 },
        { asin: 'B000TEST02', listingPrice: 12.5, identifier: 'row-2' },
      ]),
    ).resolves.toEqual([{ Status: 'Success' }]);

    expect(requests[0]?.input).toBe('https://sellingpartnerapi-eu.amazon.com/products/fees/v0/feesEstimate');
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual([
      {
        FeesEstimateRequest: {
          MarketplaceId: 'A1F83G8C2ARO7P',
          IsAmazonFulfilled: true,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: 'GBP',
              Amount: 9.99,
            },
          },
          Identifier: 'B000TEST01',
        },
        IdType: 'ASIN',
        IdValue: 'B000TEST01',
      },
      {
        FeesEstimateRequest: {
          MarketplaceId: 'A1F83G8C2ARO7P',
          IsAmazonFulfilled: true,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: 'GBP',
              Amount: 12.5,
            },
          },
          Identifier: 'row-2',
        },
        IdType: 'ASIN',
        IdValue: 'B000TEST02',
      },
    ]);
  });

  it('rejects invalid getMyFeesEstimates inputs', async () => {
    const client = createAmazonSpApiClient(config, { getAccessToken: async () => validToken });

    await expect(client.getMyFeesEstimates([])).rejects.toThrow(
      'Amazon fees estimate requests require at least one item',
    );
    await expect(
      client.getMyFeesEstimates(Array.from({ length: 21 }, (_, index) => ({ asin: `B000T${String(index).padStart(5, '0')}`, listingPrice: 10 }))),
    ).rejects.toThrow('Amazon fees estimate requests support at most 20 items');
    await expect(client.getMyFeesEstimates([{ asin: 'B000TEST01', listingPrice: 0 }])).rejects.toThrow(
      'Amazon fees estimate listing price must be positive',
    );
  });

  it('retries 429 and 5xx responses and respects Retry-After seconds', async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const fetch: typeof globalThis.fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({ message: 'throttled' }, 429, { 'retry-after': '2' });
      }
      if (attempts === 2) {
        return jsonResponse({ message: 'temporary' }, 503);
      }
      return jsonResponse({ responses: [] });
    };
    const client = createAmazonSpApiClient(config, {
      fetch,
      getAccessToken: async () => validToken,
      sleep: async (durationMs) => {
        sleeps.push(durationMs);
      },
    });

    await expect(client.getCompetitiveSummary(['B000TEST01'])).resolves.toEqual({ responses: [] });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([2_000, 1_000]);
  });

  it('does not retry non-transient 400, 401, or 403 responses', async () => {
    for (const status of [400, 401, 403]) {
      let attempts = 0;
      const fetch: typeof globalThis.fetch = async () => {
        attempts += 1;
        return jsonResponse({ message: `failed with x-amz-access-token: sp-api-access-token` }, status);
      };
      const client = createAmazonSpApiClient(config, {
        fetch,
        getAccessToken: async () => validToken,
        sleep: async () => undefined,
      });

      await expect(client.getCompetitiveSummary(['B000TEST01'])).rejects.toMatchObject({ status });
      expect(attempts).toBe(1);
    }
  });

  it('sanitizes SP-API error bodies and access tokens from thrown errors', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      jsonResponse(
        {
          message: 'failed with x-amz-access-token: sp-api-access-token',
          AMAZON_REFRESH_TOKEN: 'lwa-refresh-token',
          AMAZON_LWA_CLIENT_SECRET: 'lwa-client-secret',
        },
        403,
      );
    const client = createAmazonSpApiClient(config, { fetch, getAccessToken: async () => validToken });

    try {
      await client.getCompetitiveSummary(['B000TEST01']);
    } catch (error) {
      expect(error).toBeInstanceOf(AmazonSpApiHttpError);
      expect(String(error)).not.toContain('sp-api-access-token');
      expect(JSON.stringify(error)).not.toContain('sp-api-access-token');
      expect(JSON.stringify(error)).not.toContain('lwa-refresh-token');
      expect(JSON.stringify(error)).not.toContain('lwa-client-secret');
      return;
    }

    throw new Error('Expected AmazonSpApiHttpError');
  });
});
