import { describe, expect, it } from 'vitest';
import { createLwaClient } from './lwa';
import type { AmazonConfig } from './config';

const config: AmazonConfig = {
  clientId: 'lwa-client-id',
  clientSecret: 'lwa-client-secret',
  refreshToken: 'lwa-refresh-token',
  region: 'eu-west-1',
  endpoint: 'https://sellingpartnerapi-eu.amazon.com',
  marketplaceId: 'A1F83G8C2ARO7P',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createLwaClient', () => {
  it('requests an LWA access token with refresh_token grant and no scope', async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init = {}) => {
      requests.push({ input: String(input), init });
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    };

    const client = createLwaClient(config, { fetch, nowMs: () => 1_000 });

    await expect(client.getAccessToken()).resolves.toEqual({
      accessToken: 'access-token',
      expiresAtMs: 3_601_000,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe('https://api.amazon.com/auth/o2/token');
    expect(requests[0]?.init.method).toBe('POST');
    expect(new Headers(requests[0]?.init.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded;charset=UTF-8',
    );

    const body = new URLSearchParams(String(requests[0]?.init.body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('lwa-refresh-token');
    expect(body.get('client_id')).toBe('lwa-client-id');
    expect(body.get('client_secret')).toBe('lwa-client-secret');
    expect(body.has('scope')).toBe(false);
  });

  it('caches the LWA token and refreshes inside the expiry safety window', async () => {
    let now = 10_000;
    let tokenNumber = 0;
    const fetch: typeof globalThis.fetch = async () => {
      tokenNumber += 1;
      return jsonResponse({ access_token: `access-token-${tokenNumber}`, expires_in: 3600 });
    };

    const client = createLwaClient(config, { fetch, nowMs: () => now });

    await expect(client.getAccessToken()).resolves.toMatchObject({ accessToken: 'access-token-1' });
    await expect(client.getAccessToken()).resolves.toMatchObject({ accessToken: 'access-token-1' });
    expect(tokenNumber).toBe(1);

    now = 3_610_000 - 59_000;
    await expect(client.getAccessToken()).resolves.toMatchObject({ accessToken: 'access-token-2' });
    expect(tokenNumber).toBe(2);
  });

  it('throws sanitized LWA errors without exposing client secret or refresh token', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      jsonResponse(
        {
          error: 'invalid_grant',
          message: 'refresh_token=lwa-refresh-token client_secret=lwa-client-secret',
        },
        401,
      );

    const client = createLwaClient(config, { fetch, nowMs: () => 1_000 });

    try {
      await client.getAccessToken();
    } catch (error) {
      expect(String(error)).not.toContain('lwa-refresh-token');
      expect(String(error)).not.toContain('lwa-client-secret');
      expect(JSON.stringify(error)).not.toContain('lwa-refresh-token');
      expect(JSON.stringify(error)).not.toContain('lwa-client-secret');
      return;
    }

    throw new Error('Expected LWA token refresh failure');
  });
});
