import { describe, expect, it } from 'vitest';
import { createKeepaConfig } from './config';

describe('createKeepaConfig', () => {
  it('loads Keepa defaults from the SDD when optional values are absent', () => {
    expect(createKeepaConfig({ KEEPA_API_KEY: 'keepa-secret-key' })).toEqual({
      apiKey: 'keepa-secret-key',
      domain: 2,
      initialOperationalTokens: 300,
      refillTokensPerMinute: 5,
    });
  });

  it('rejects missing API keys', () => {
    expect(() => createKeepaConfig({})).toThrow('KEEPA_API_KEY is required');
  });

  it('rejects non-integer Keepa domain values', () => {
    expect(() => createKeepaConfig({ KEEPA_API_KEY: 'keepa-secret-key', KEEPA_DOMAIN: '2.5' })).toThrow(
      'KEEPA_DOMAIN must be a positive integer',
    );
  });
});
