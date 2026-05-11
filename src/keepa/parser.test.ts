import { describe, expect, it } from 'vitest';
import { parseKeepaProductMetrics } from './parser';

describe('parseKeepaProductMetrics', () => {
  it('maps Keepa raw csv int arrays into normalized product metrics', () => {
    const metrics = parseKeepaProductMetrics({
      asin: 'B000TEST01',
      title: 'Amazon Listing Pack of 4',
      csv: [
        undefined,
        undefined,
        undefined,
        [10, 1234],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        [10, 7],
        undefined,
        undefined,
        undefined,
        undefined,
        [10, 45],
        [10, 321],
        [10, 1999],
      ],
      stats: {
        avg30: [undefined, undefined, undefined, 1500],
        avg90: [undefined, undefined, undefined, 1750],
        salesRankDrops30: 8,
        salesRankDrops90: 21,
      },
    });

    expect(metrics).toMatchObject({
      asin: 'B000TEST01',
      title: 'Amazon Listing Pack of 4',
      buyBoxPrice: 19.99,
      rating: 4.5,
      reviewCount: 321,
      bsrCurrent: 1234,
      avgBsr30: 1500,
      avgBsr90: 1750,
      salesRankDrops30: 8,
      salesRankDrops90: 21,
      offerCount: 7,
    });
  });

  it('treats -1 prices as missing offers', () => {
    const metrics = parseKeepaProductMetrics({
      asin: 'B000TEST01',
      csv: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        [10, -1],
      ],
    });

    expect(metrics.buyBoxPrice).toBeUndefined();
  });

  it('rejects humanized csv objects because raw Keepa csv must be int[][]', () => {
    expect(() =>
      parseKeepaProductMetrics({
        asin: 'B000TEST01',
        csv: {
          AMAZON: [[10, 1999]],
        },
      }),
    ).toThrow('Keepa raw csv must be an int[][] array');
  });
});
