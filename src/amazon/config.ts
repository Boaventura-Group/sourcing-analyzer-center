const DEFAULT_REGION = 'eu-west-1';
const DEFAULT_ENDPOINT = 'https://sellingpartnerapi-eu.amazon.com';
const DEFAULT_MARKETPLACE_ID = 'A1F83G8C2ARO7P';
const DEFAULT_CURRENCY_CODE = 'GBP';

export type AmazonConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: string;
  endpoint: string;
  marketplaceId: string;
  currencyCode: string;
};

type AmazonEnv = {
  AMAZON_LWA_CLIENT_ID?: string | undefined;
  AMAZON_LWA_CLIENT_SECRET?: string | undefined;
  AMAZON_REFRESH_TOKEN?: string | undefined;
  AMAZON_REGION?: string | undefined;
  AMAZON_SPAPI_ENDPOINT?: string | undefined;
  AMAZON_MARKETPLACE_ID?: string | undefined;
  AMAZON_CURRENCY_CODE?: string | undefined;
};

function requiredString(value: string | undefined, name: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`${name} is required`);
  }

  return trimmed;
}

function optionalString(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function createAmazonConfig(env: AmazonEnv): AmazonConfig {
  const marketplaceId = optionalString(env.AMAZON_MARKETPLACE_ID, DEFAULT_MARKETPLACE_ID);
  const currencyCode = env.AMAZON_CURRENCY_CODE?.trim();

  if (marketplaceId !== DEFAULT_MARKETPLACE_ID && !currencyCode) {
    throw new Error('AMAZON_CURRENCY_CODE is required when AMAZON_MARKETPLACE_ID is overridden');
  }

  return {
    clientId: requiredString(env.AMAZON_LWA_CLIENT_ID, 'AMAZON_LWA_CLIENT_ID'),
    clientSecret: requiredString(env.AMAZON_LWA_CLIENT_SECRET, 'AMAZON_LWA_CLIENT_SECRET'),
    refreshToken: requiredString(env.AMAZON_REFRESH_TOKEN, 'AMAZON_REFRESH_TOKEN'),
    region: optionalString(env.AMAZON_REGION, DEFAULT_REGION),
    endpoint: optionalString(env.AMAZON_SPAPI_ENDPOINT, DEFAULT_ENDPOINT),
    marketplaceId,
    currencyCode: currencyCode || DEFAULT_CURRENCY_CODE,
  };
}
