const CsvType = {
  SALES: 3,
  COUNT_NEW: 11,
  RATING: 16,
  COUNT_REVIEWS: 17,
  BUY_BOX_SHIPPING: 18,
} as const;

type KeepaStats = {
  current?: unknown;
  avg30?: unknown;
  avg90?: unknown;
  salesRankDrops30?: unknown;
  salesRankDrops90?: unknown;
};

type KeepaRawProduct = {
  asin: string;
  title?: string | undefined;
  csv?: unknown;
  stats?: KeepaStats | undefined;
};

export type KeepaProductMetrics = {
  asin: string;
  title?: string | undefined;
  buyBoxPrice?: number | undefined;
  rating?: number | undefined;
  reviewCount?: number | undefined;
  bsrCurrent?: number | undefined;
  avgBsr30?: number | undefined;
  avgBsr90?: number | undefined;
  salesRankDrops30?: number | undefined;
  salesRankDrops90?: number | undefined;
  offerCount?: number | undefined;
  raw: KeepaRawProduct;
};

function assertCsvArray(csv: unknown): Array<unknown> {
  if (csv === undefined || csv === null) {
    return [];
  }

  if (!Array.isArray(csv)) {
    throw new Error('Keepa raw csv must be an int[][] array');
  }

  for (const series of csv) {
    if (series === undefined || series === null) {
      continue;
    }

    if (!Array.isArray(series) || !series.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('Keepa raw csv must be an int[][] array');
    }
  }

  return csv;
}

function getSeriesLastNumber(csv: Array<unknown>, index: number): number | undefined {
  const series = csv[index];

  if (!Array.isArray(series) || series.length < 2) {
    return undefined;
  }

  const value = series[series.length - 1];

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function getStatsIndexedNumber(value: unknown, index: number): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const item = value[index];

  if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) {
    return undefined;
  }

  return item;
}

function getStatsNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function minorUnitToGbp(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.round((value / 100 + Number.EPSILON) * 100) / 100;
}

function ratingToStars(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.round((value / 10 + Number.EPSILON) * 10) / 10;
}

function setOptionalNumber<T extends Record<string, unknown>>(
  target: T,
  key: keyof T,
  value: number | undefined,
): void {
  if (value !== undefined) {
    target[key] = value as T[keyof T];
  }
}

export function parseKeepaProductMetrics(product: KeepaRawProduct): KeepaProductMetrics {
  const csv = assertCsvArray(product.csv);
  const statsCurrent = product.stats?.current;
  const result: KeepaProductMetrics = {
    asin: product.asin,
    raw: product,
  };

  if (product.title !== undefined) {
    result.title = product.title;
  }

  setOptionalNumber(
    result,
    'buyBoxPrice',
    minorUnitToGbp(
      getSeriesLastNumber(csv, CsvType.BUY_BOX_SHIPPING) ??
        getStatsIndexedNumber(statsCurrent, CsvType.BUY_BOX_SHIPPING),
    ),
  );
  setOptionalNumber(
    result,
    'rating',
    ratingToStars(getSeriesLastNumber(csv, CsvType.RATING) ?? getStatsIndexedNumber(statsCurrent, CsvType.RATING)),
  );
  setOptionalNumber(
    result,
    'reviewCount',
    getSeriesLastNumber(csv, CsvType.COUNT_REVIEWS) ?? getStatsIndexedNumber(statsCurrent, CsvType.COUNT_REVIEWS),
  );
  setOptionalNumber(
    result,
    'bsrCurrent',
    getSeriesLastNumber(csv, CsvType.SALES) ?? getStatsIndexedNumber(statsCurrent, CsvType.SALES),
  );
  setOptionalNumber(
    result,
    'offerCount',
    getSeriesLastNumber(csv, CsvType.COUNT_NEW) ?? getStatsIndexedNumber(statsCurrent, CsvType.COUNT_NEW),
  );

  if (product.stats !== undefined) {
    setOptionalNumber(result, 'avgBsr30', getStatsIndexedNumber(product.stats.avg30, CsvType.SALES));
    setOptionalNumber(result, 'avgBsr90', getStatsIndexedNumber(product.stats.avg90, CsvType.SALES));
    setOptionalNumber(result, 'salesRankDrops30', getStatsNumber(product.stats.salesRankDrops30));
    setOptionalNumber(result, 'salesRankDrops90', getStatsNumber(product.stats.salesRankDrops90));
  }

  return result;
}
