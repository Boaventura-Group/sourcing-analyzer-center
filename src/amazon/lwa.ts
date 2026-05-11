import { sanitizeLogPayload } from '../utils/logger';
import type { AmazonConfig } from './config';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 60_000;

export type AmazonAccessToken = {
  accessToken: string;
  expiresAtMs: number;
};

type LwaClientDependencies = {
  fetch?: typeof globalThis.fetch | undefined;
  nowMs?: (() => number) | undefined;
};

function getNumberField(payload: Record<string, unknown>, field: string): number | undefined {
  const value = payload[field];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function getStringField(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function redactKnownSecretValues(value: string, secrets: string[]): string {
  return secrets.reduce((redacted, secret) => {
    if (secret.length === 0) {
      return redacted;
    }

    return redacted.split(secret).join('[REDACTED]');
  }, value);
}

function sanitizeText(value: string, secrets: string[]): string {
  try {
    return redactKnownSecretValues(JSON.stringify(sanitizeLogPayload(JSON.parse(value) as unknown)), secrets);
  } catch {
    const sanitized = sanitizeLogPayload(value);
    return redactKnownSecretValues(typeof sanitized === 'string' ? sanitized : 'Unexpected LWA response', secrets);
  }
}

export class LwaHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, secrets: string[]) {
    super(`LWA HTTP ${status}`);
    this.name = 'LwaHttpError';
    this.status = status;
    this.body = sanitizeText(body, secrets);
  }
}

function parseAccessToken(payload: unknown, nowMs: number): AmazonAccessToken {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid LWA token response');
  }

  const record = payload as Record<string, unknown>;
  const accessToken = getStringField(record, 'access_token');
  const expiresIn = getNumberField(record, 'expires_in');

  if (accessToken === undefined || expiresIn === undefined || expiresIn <= 0) {
    throw new Error('Invalid LWA token response');
  }

  return {
    accessToken,
    expiresAtMs: nowMs + expiresIn * 1_000,
  };
}

export function createLwaClient(config: AmazonConfig, dependencies: LwaClientDependencies = {}) {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const nowMs = dependencies.nowMs ?? Date.now;
  let cachedToken: AmazonAccessToken | undefined;
  let inFlightRefresh: Promise<AmazonAccessToken> | undefined;

  async function refreshAccessToken(): Promise<AmazonAccessToken> {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', config.refreshToken);
    body.set('client_id', config.clientId);
    body.set('client_secret', config.clientSecret);

    const response = await fetchImpl(LWA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        accept: 'application/json',
      },
      body,
    });

    const responseBody = await response.text();

    if (!response.ok) {
      throw new LwaHttpError(response.status, responseBody, [config.refreshToken, config.clientSecret]);
    }

    return parseAccessToken(JSON.parse(responseBody) as unknown, nowMs());
  }

  return {
    async getAccessToken(): Promise<AmazonAccessToken> {
      if (cachedToken && cachedToken.expiresAtMs - nowMs() > TOKEN_EXPIRY_SAFETY_WINDOW_MS) {
        return cachedToken;
      }

      inFlightRefresh ??= refreshAccessToken();

      try {
        cachedToken = await inFlightRefresh;
      } finally {
        inFlightRefresh = undefined;
      }

      return cachedToken;
    },
  };
}
