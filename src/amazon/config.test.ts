import { describe, expect, it } from 'vitest';
import { createAmazonConfig } from './config';

describe('createAmazonConfig', () => {
  const requiredEnv = {
    AMAZON_LWA_CLIENT_ID: 'lwa-client-id',
    AMAZON_LWA_CLIENT_SECRET: 'lwa-client-secret',
    AMAZON_REFRESH_TOKEN: 'lwa-refresh-token',
  };

  it('loads Amazon SP-API defaults from the SDD when optional values are absent', () => {
    expect(createAmazonConfig(requiredEnv)).toEqual({
      clientId: 'lwa-client-id',
      clientSecret: 'lwa-client-secret',
      refreshToken: 'lwa-refresh-token',
      region: 'eu-west-1',
      endpoint: 'https://sellingpartnerapi-eu.amazon.com',
      marketplaceId: 'A1F83G8C2ARO7P',
      currencyCode: 'GBP',
    });
  });

  it('loads explicit endpoint, region, marketplace, and currency overrides', () => {
    expect(
      createAmazonConfig({
        ...requiredEnv,
        AMAZON_REGION: 'eu-west-2',
        AMAZON_SPAPI_ENDPOINT: 'https://example.test',
        AMAZON_MARKETPLACE_ID: 'TEST_MARKETPLACE',
        AMAZON_CURRENCY_CODE: 'EUR',
      }),
    ).toMatchObject({
      region: 'eu-west-2',
      endpoint: 'https://example.test',
      marketplaceId: 'TEST_MARKETPLACE',
      currencyCode: 'EUR',
    });
  });

  it('requires an explicit currency when overriding the default marketplace', () => {
    expect(() =>
      createAmazonConfig({
        ...requiredEnv,
        AMAZON_MARKETPLACE_ID: 'TEST_MARKETPLACE',
      }),
    ).toThrow('AMAZON_CURRENCY_CODE is required when AMAZON_MARKETPLACE_ID is overridden');
  });

  it('rejects missing LWA credentials', () => {
    expect(() => createAmazonConfig({})).toThrow('AMAZON_LWA_CLIENT_ID is required');
    expect(() =>
      createAmazonConfig({
        AMAZON_LWA_CLIENT_ID: 'lwa-client-id',
      }),
    ).toThrow('AMAZON_LWA_CLIENT_SECRET is required');
    expect(() =>
      createAmazonConfig({
        AMAZON_LWA_CLIENT_ID: 'lwa-client-id',
        AMAZON_LWA_CLIENT_SECRET: 'lwa-client-secret',
      }),
    ).toThrow('AMAZON_REFRESH_TOKEN is required');
  });
});
