import { describe, expect, it } from 'vitest';
import { detectPackQty } from './detectPackQty';

describe('detectPackQty', () => {
  it.each([
    ['Coffee Pods Pack of 4', 4],
    ['Coffee Pods Pack Of 4', 4],
    ['Coffee Pods 4 Pack', 4],
    ['Coffee Pods 4-Pack', 4],
    ['Coffee Pods Pack x 4', 4],
    ['Coffee Pods x4', 4],
    ['Coffee Pods Case of 6', 6],
    ['Coffee Pods Case 6', 6],
    ['Coffee Pods Multipack 12', 12],
    ['Coffee Pods 12 Count', 12],
    ['Coffee Pods 12ct', 12],
  ])('detects %s as pack quantity %s', (title, expected) => {
    expect(detectPackQty(title)).toBe(expected);
  });

  it('returns 1 when no pack quantity is present', () => {
    expect(detectPackQty('Organic Sauce')).toBe(1);
  });

  it('does not treat common measures as pack quantities', () => {
    expect(detectPackQty('Organic Sauce 500ml')).toBe(1);
    expect(detectPackQty('Protein Bar 200g')).toBe(1);
    expect(detectPackQty('Cable 10cm')).toBe(1);
    expect(detectPackQty('Bottle 12oz')).toBe(1);
    expect(detectPackQty('Relief 24h')).toBe(1);
    expect(detectPackQty('Photo Paper 10 x 15 cm')).toBe(1);
    expect(detectPackQty('Frame 10 x 15cm')).toBe(1);
    expect(detectPackQty('Cable 2 x 1m')).toBe(1);
  });

  it('prefers Amazon title over supplier title when both are present', () => {
    expect(
      detectPackQty({
        amazonTitle: 'Amazon Listing Case of 6',
        supplierTitle: 'Supplier Listing Pack of 4',
      }),
    ).toBe(6);
  });

  it('uses supplier title as a fallback', () => {
    expect(detectPackQty({ supplierTitle: 'Supplier Listing Multipack 12' })).toBe(12);
  });
});
