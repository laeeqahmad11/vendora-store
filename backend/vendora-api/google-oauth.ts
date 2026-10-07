import { isValidHostedProjectId } from "./hosted-runtime.ts";
import {
  assertNetworkTimeoutMs,
  boundedTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from "./network-timeout.ts";
import {
  encodeBase64Url,
  encodeJwtPart,
  pkcs8FromPem,
  utf8,
} from "./web-crypto.ts";

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FIRESTORE_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/datastore";

const ASSERTION_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const MAX_ASSERTION_SECONDS = 60 * 60;
const TOKEN_REFRESH_SKEW_MS = 60 * 1_000;

interface ServiceAccountCredential {
  readonly privateKeyId: string;
  readonly privateKey: string;
  readonly clientEmail: string;
}

interface CachedToken {
  readonly value: string;
  readonly refreshAt: number;
}

export interface ServiceAccountTokenProviderOptions {
  readonly projectId: string;
  readonly credentialJson: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly fetchTimeoutMs?: number;
}

function configurationFailure(): never {
  throw new Error("Hosted OAuth credential configuration is invalid.");
}

function exchangeFailure(): never {
  throw new Error("Hosted OAuth token exchange failed.");
}

function credential(
  value: string,
  projectId: string,
): ServiceAccountCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    configurationFailure();
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    configurationFailure();
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.type !== "service_account" ||
    record.project_id !== projectId ||
    record.token_uri !== GOOGLE_OAUTH_TOKEN_URL ||
    typeof record.private_key_id !== "string" ||
    !/^[A-Za-z0-9_-]{1,256}$/u.test(record.private_key_id) ||
    typeof record.private_key !== "string" ||
    typeof record.client_email !== "string" ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/u.test(
      record.client_email,
    )
  ) {
    configurationFailure();
  }
  return Object.freeze({
    privateKeyId: record.private_key_id,
    privateKey: record.private_key,
    clientEmail: record.client_email,
  });
}

async function signingKey(privateKey: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      pkcs8FromPem(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    configurationFailure();
  }
}

export async function createServiceAccountAccessTokenProvider({
  projectId,
  credentialJson,
  fetcher = globalThis.fetch,
  now = Date.now,
  fetchTimeoutMs = PROVIDER_REQUEST_TIMEOUT_MS,
}: ServiceAccountTokenProviderOptions): Promise<() => Promise<string>> {
  if (
    !isValidHostedProjectId(projectId) || typeof fetcher !== "function" ||
    typeof now !== "function" ||
    assertNetworkTimeoutMs(fetchTimeoutMs) !== fetchTimeoutMs
  ) {
    configurationFailure();
  }
  const account = credential(credentialJson, projectId);
  const key = await signingKey(account.privateKey);
  let cached: CachedToken | null = null;
  let exchange: Promise<CachedToken> | null = null;

  async function requestToken(): Promise<CachedToken> {
    const issuedAt = Math.floor(now() / 1_000);
    const header = encodeJwtPart({
      alg: "RS256",
      typ: "JWT",
      kid: account.privateKeyId,
    });
    const claims = encodeJwtPart({
      iss: account.clientEmail,
      scope: FIRESTORE_OAUTH_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + MAX_ASSERTION_SECONDS,
    });
    const signingInput = `${header}.${claims}`;
    let signature: ArrayBuffer;
    try {
      signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        utf8(signingInput),
      );
    } catch {
      exchangeFailure();
    }
    const assertion = `${signingInput}.${
      encodeBase64Url(new Uint8Array(signature))
    }`;
    const body = new URLSearchParams({
      grant_type: ASSERTION_GRANT,
      assertion,
    });

    let response: Response;
    try {
      response = await fetcher(GOOGLE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        redirect: "error",
        signal: boundedTimeoutSignal(fetchTimeoutMs),
      });
    } catch {
      exchangeFailure();
    }
    if (!response.ok) exchangeFailure();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      exchangeFailure();
    }
    const token = payload as Record<string, unknown>;
    if (
      token === null ||
      typeof token !== "object" ||
      Array.isArray(token) ||
      token.token_type !== "Bearer" ||
      typeof token.access_token !== "string" ||
      token.access_token.length === 0 ||
      token.access_token.length > 16_384 ||
      typeof token.expires_in !== "number" ||
      !Number.isSafeInteger(token.expires_in) ||
      token.expires_in <= 0 ||
      token.expires_in > 86_400
    ) {
      exchangeFailure();
    }
    const lifetimeMs = token.expires_in * 1_000;
    return Object.freeze({
      value: token.access_token,
      refreshAt: now() + Math.max(0, lifetimeMs - TOKEN_REFRESH_SKEW_MS),
    });
  }

  return async function getAccessToken(): Promise<string> {
    if (cached && now() < cached.refreshAt) return cached.value;
    if (!exchange) exchange = requestToken();
    try {
      cached = await exchange;
      return cached.value;
    } finally {
      exchange = null;
    }
  };
}
