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
});
