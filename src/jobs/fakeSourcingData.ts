import type { D1JobItem } from './d1JobStore';

export class FakeSourcingDataError extends Error {
  constructor(message = 'Controlled fake sourcing data failure') {
    super(message);
    this.name = 'FakeSourcingDataError';
  }
}

export type FakeSourcingData = {
  amazonTitle?: string;
  amazonBuyBox?: number;
  keepaBuyBox?: number;
  amazonFeesEstimate?: number;
  keepaRating?: number;
  keepaReviewCount?: number;
  keepaBsrCurrent?: number;
  keepaAvgBsr30?: number;
  keepaAvgBsr90?: number;
  keepaSalesRankDrops30?: number;
  keepaSalesRankDrops90?: number;
  keepaOfferCount?: number;
  keepaSellerCount?: number;
};

const FIXTURES: Record<string, FakeSourcingData> = {
  B000PROFIT: {
    amazonTitle: 'Amazon Profit Fixture',
    amazonBuyBox: 20,
    keepaBuyBox: 19.9,
    amazonFeesEstimate: 3,
    keepaRating: 4.6,
    keepaReviewCount: 480,
    keepaBsrCurrent: 1200,
    keepaAvgBsr30: 1400,
    keepaAvgBsr90: 1600,
    keepaSalesRankDrops30: 28,
    keepaSalesRankDrops90: 84,
    keepaOfferCount: 9,
    keepaSellerCount: 7,
  },
  B000NEG001: {
    amazonTitle: 'Amazon Negative Fixture',
    amazonBuyBox: 10,
    keepaBuyBox: 10.1,
    amazonFeesEstimate: 4,
    keepaRating: 3.8,
    keepaReviewCount: 74,
    keepaBsrCurrent: 9000,
    keepaAvgBsr30: 9400,
    keepaAvgBsr90: 9800,
    keepaSalesRankDrops30: 6,
    keepaSalesRankDrops90: 20,
    keepaOfferCount: 14,
    keepaSellerCount: 11,
  },
  B000PACK02: {
    amazonTitle: 'Amazon Value Case of 2',
    amazonBuyBox: 20,
    keepaBuyBox: 20,
    amazonFeesEstimate: 3,
    keepaRating: 4.4,
    keepaReviewCount: 210,
    keepaBsrCurrent: 2200,
    keepaAvgBsr30: 2300,
    keepaAvgBsr90: 2500,
    keepaSalesRankDrops30: 18,
    keepaSalesRankDrops90: 50,
    keepaOfferCount: 8,
    keepaSellerCount: 6,
  },
  B00000NOBB: {
    amazonTitle: 'Amazon No Buy Box Fixture',
    amazonFeesEstimate: 2,
    keepaRating: 4.1,
    keepaReviewCount: 38,
    keepaBsrCurrent: 12000,
    keepaAvgBsr30: 13000,
    keepaAvgBsr90: 14000,
    keepaSalesRankDrops30: 3,
    keepaSalesRankDrops90: 11,
    keepaOfferCount: 3,
    keepaSellerCount: 3,
  },
  B000NOFEES: {
    amazonTitle: 'Amazon Missing Fees Fixture',
    amazonBuyBox: 15,
    keepaBuyBox: 15.1,
    keepaRating: 4,
    keepaReviewCount: 90,
    keepaBsrCurrent: 7000,
    keepaAvgBsr30: 7200,
    keepaAvgBsr90: 7600,
    keepaSalesRankDrops30: 8,
    keepaSalesRankDrops90: 22,
    keepaOfferCount: 5,
    keepaSellerCount: 4,
  },
};

function hashAsin(asin: string): number {
  let hash = 0;

  for (const character of asin) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildHashBasedData(asin: string): FakeSourcingData {
  const hash = hashAsin(asin);
  const amazonBuyBox = roundMoney(9 + (hash % 1700) / 100);
  const keepaAdjustment = ((hash % 7) - 3) / 100;
  const keepaBuyBox = roundMoney(amazonBuyBox * (1 + keepaAdjustment));

  return {
    amazonTitle: `Amazon Fixture ${asin}`,
    amazonBuyBox,
    keepaBuyBox,
    amazonFeesEstimate: roundMoney(1.25 + (hash % 450) / 100),
    keepaRating: roundMoney(3.5 + (hash % 16) / 10),
    keepaReviewCount: 25 + (hash % 975),
    keepaBsrCurrent: 1000 + (hash % 40000),
    keepaAvgBsr30: 1100 + (hash % 42000),
    keepaAvgBsr90: 1200 + (hash % 44000),
    keepaSalesRankDrops30: hash % 31,
    keepaSalesRankDrops90: hash % 91,
    keepaOfferCount: 1 + (hash % 20),
    keepaSellerCount: 1 + (hash % 14),
  };
}

export function getFakeSourcingData(item: D1JobItem): FakeSourcingData {
  const asin = item.asin.toUpperCase();

  if (asin.endsWith('ERROR')) {
    throw new FakeSourcingDataError();
  }

  return FIXTURES[asin] ?? buildHashBasedData(asin);
}
