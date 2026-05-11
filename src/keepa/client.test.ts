import { describe, expect, it } from 'vitest';
import {
  KeepaHttpError,
  buildKeepaProductUrl,
  createKeepaClient,
  estimateKeepaMainProductTokens,
} from './client';

const config = {
  apiKey: 'keepa-secret-key',
  domain: 2,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildKeepaProductUrl', () => {
  it('builds the main Keepa product request from the SDD contract', () => {
    const url = buildKeepaProductUrl(config, ['B000TEST01', 'B000TEST02']);

    expect(url.pathname).toBe('/product');
    expect(url.searchParams.get('key')).toBe('keepa-secret-key');
    expect(url.searchParams.get('domain')).toBe('2');
    expect(url.searchParams.get('asin')).toBe('B000TEST01,B000TEST02');
    expect(url.searchParams.get('stats')).toBe('90');
    expect(url.searchParams.get('buybox')).toBe('1');
    expect(url.searchParams.get('rating')).toBe('1');
    expect(url.searchParams.get('history')).toBe('0');
    expect(url.searchParams.has('offers')).toBe(false);
  });

  it('rejects main product batches above 100 ASINs', () => {
    expect(() => buildKeepaProductUrl(config, Array.from({ length: 101 }, (_, index) => `B000T${String(index).padStart(5, '0')}`))).toThrow(
      'Keepa product requests support at most 100 ASINs',
    );
  });

  it('keeps offers fallback requests bounded and omits buybox', () => {
    const url = buildKeepaProductUrl(config, ['B000TEST01'], { offers: 20 });

    expect(url.searchParams.get('offers')).toBe('20');
    expect(url.searchParams.has('buybox')).toBe(false);
  });

  it('rejects invalid offers fallback shapes', () => {
    expect(() => buildKeepaProductUrl(config, ['B000TEST01'], { offers: 19 })).toThrow(
      'Keepa offers must be an integer between 20 and 100',
    );
    expect(() => buildKeepaProductUrl(config, Array.from({ length: 21 }, (_, index) => `B000T${String(index).padStart(5, '0')}`), { offers: 20 })).toThrow(
      'Keepa offers product requests support at most 20 ASINs',
    );
  });
});

describe('createKeepaClient', () => {
  it('fetches token status without exposing the API key in thrown errors', async () => {
    const fetch: typeof globalThis.fetch = async (input) => {
      expect(String(input)).toContain('/token?');
      expect(String(input)).toContain('key=keepa-secret-key');
      return jsonResponse({ tokensLeft: 42, refillIn: 120, refillRate: 5 });
    };

    const client = createKeepaClient(config, { fetch });

    await expect(client.getTokenStatus()).resolves.toEqual({
      tokensLeft: 42,
      refillIn: 120,
      refillRate: 5,
    });
  });

  it('retries transient Keepa product failures', async () => {
    let attempts = 0;
    const fetch: typeof globalThis.fetch = async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: 'temporary' }, 503)
        : jsonResponse({ products: [{ asin: 'B000TEST01', csv: [] }] });
    };

    const client = createKeepaClient(config, {
      fetch,
      sleep: async () => undefined,
    });

    await expect(client.getProducts(['B000TEST01'])).resolves.toEqual({
      products: [{ asin: 'B000TEST01', csv: [] }],
    });
    expect(attempts).toBe(2);
  });

  it('throws sanitized HTTP errors for non-retryable Keepa failures', async () => {
    const fetch: typeof globalThis.fetch = async () => jsonResponse({ error: 'bad key keepa-secret-key' }, 401);
    const client = createKeepaClient(config, { fetch });

    await expect(client.getProducts(['B000TEST01'])).rejects.toMatchObject({
      name: 'KeepaHttpError',
      status: 401,
    });

    try {
      await client.getProducts(['B000TEST01']);
    } catch (error) {
      expect(error).toBeInstanceOf(KeepaHttpError);
      expect(String(error)).not.toContain('keepa-secret-key');
    }
  });

  it('redacts JSON-style secrets from stored Keepa HTTP error bodies', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      new Response('{"apiKey":"keepa-secret-key","message":"bad token keepa-secret-key"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    const client = createKeepaClient(config, { fetch });

    try {
      await client.getProducts(['B000TEST01']);
    } catch (error) {
      expect(error).toBeInstanceOf(KeepaHttpError);
      expect((error as KeepaHttpError).body).toContain('"apiKey":"[REDACTED]"');
      expect((error as KeepaHttpError).body).not.toContain('keepa-secret-key');
      return;
    }

    throw new Error('Expected KeepaHttpError');
  });
});

describe('estimateKeepaMainProductTokens', () => {
  it('uses the SDD main request estimate of four tokens per ASIN', () => {
    expect(estimateKeepaMainProductTokens(100)).toBe(400);
  });
});
