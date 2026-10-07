import { SafeHttpError } from "./http-errors.js";
import {
  assertNetworkTimeoutMs,
  boundedTimeoutSignal,
  KEY_DISCOVERY_TIMEOUT_MS,
} from "./network-timeout.ts";
import { decodeBase64Url, decodeJwtPart, utf8 } from "./web-crypto.ts";

export const FIREBASE_APP_CHECK_JWKS_URL =
  "https://firebaseappcheck.googleapis.com/v1/jwks";

const APP_CHECK_HEADER = "x-firebase-appcheck";
const MAX_CACHE_SECONDS = 6 * 60 * 60;
const MAX_TOKEN_BYTES = 16 * 1024;
const MAX_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MIN_UNKNOWN_KEY_REFRESH_INTERVAL_MS = 60 * 1_000;

interface KeyCache {
  readonly expiresAt: number;
  readonly keys: ReadonlyMap<string, CryptoKey>;
}

export interface FirebaseAppCheckVerifierOptions {
  readonly projectNumber: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly fetchTimeoutMs?: number;
}

export interface VerifiedFirebaseAppCheckToken {
  readonly appId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

function unauthenticated(): never {
  throw new SafeHttpError(
    "unauthenticated",
    "Valid App Check is required.",
  );
}

export function isValidFirebaseProjectNumber(
  value: unknown,
): value is string {
  return typeof value === "string" && /^[1-9][0-9]{5,19}$/u.test(value);
}

function cacheSeconds(headers: Headers): number {
  const directives = headers.get("cache-control") ?? "";
  const match = /(?:^|,)\s*max-age=([0-9]+)\s*(?:,|$)/iu.exec(directives);
  if (!match) return 0;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds)
    ? Math.min(seconds, MAX_CACHE_SECONDS)
    : 0;
}

function validJwk(value: unknown): value is JsonWebKey & { kid: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const key = value as Record<string, unknown>;
  return (
    typeof key.kid === "string" && key.kid.length > 0 &&
    key.kid.length <= 256 &&
    key.kty === "RSA" &&
    typeof key.n === "string" && key.n.length > 0 &&
    typeof key.e === "string" && key.e.length > 0 &&
    (key.alg === undefined || key.alg === "RS256") &&
    (key.use === undefined || key.use === "sig")
  );
}

async function importVerificationKey(key: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function validNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validAudience(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= 10 &&
    value.every((entry) => typeof entry === "string") &&
    value.includes(expected);
}

function validAppId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    !/[\s\u0000-\u001f\u007f]/u.test(value);
}

export function createFirebaseAppCheckVerifier({
  projectNumber,
  fetcher = globalThis.fetch,
  now = Date.now,
  fetchTimeoutMs = KEY_DISCOVERY_TIMEOUT_MS,
}: FirebaseAppCheckVerifierOptions) {
  if (
    !isValidFirebaseProjectNumber(projectNumber) ||
    typeof fetcher !== "function" ||
    typeof now !== "function" ||
    assertNetworkTimeoutMs(fetchTimeoutMs) !== fetchTimeoutMs
  ) {
    throw new TypeError(
      "Firebase App Check verifier configuration is invalid.",
    );
  }
  const expectedIssuer =
    `https://firebaseappcheck.googleapis.com/${projectNumber}`;
  const expectedAudience = `projects/${projectNumber}`;

  let cache: KeyCache | null = null;
  let refresh: Promise<KeyCache> | null = null;
  let lastUnknownKeyRefreshAt: number | null = null;

  async function refreshKeys(): Promise<KeyCache> {
    if (refresh) return await refresh;
    refresh = (async () => {
      let response: Response;
      try {
        response = await fetcher(FIREBASE_APP_CHECK_JWKS_URL, {
          method: "GET",
          headers: { accept: "application/json" },
          redirect: "error",
          signal: boundedTimeoutSignal(fetchTimeoutMs),
        });
      } catch {
        unauthenticated();
      }
      if (!response.ok) unauthenticated();

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        unauthenticated();
      }
      const candidates = (payload as { keys?: unknown })?.keys;
      if (
        !Array.isArray(candidates) || candidates.length === 0 ||
        candidates.length > 20
      ) {
        unauthenticated();
      }
      const imported = new Map<string, CryptoKey>();
      try {
        for (const candidate of candidates) {
          if (!validJwk(candidate) || imported.has(candidate.kid)) {
            unauthenticated();
          }
          imported.set(candidate.kid, await importVerificationKey(candidate));
        }
      } catch (error) {
        if (error instanceof SafeHttpError) throw error;
        unauthenticated();
      }
      const next = Object.freeze({
        expiresAt: now() + cacheSeconds(response.headers) * 1_000,
        keys: imported as ReadonlyMap<string, CryptoKey>,
      });
      cache = next;
      return next;
    })();
    try {
      return await refresh;
    } finally {
      refresh = null;
    }
  }

  async function verificationKey(kid: string): Promise<CryptoKey> {
    let current = cache && now() < cache.expiresAt
      ? cache
      : await refreshKeys();
    const known = current.keys.get(kid);
    if (known) return known;

    const currentTime = now();
    if (
      lastUnknownKeyRefreshAt === null ||
      currentTime - lastUnknownKeyRefreshAt >=
        MIN_UNKNOWN_KEY_REFRESH_INTERVAL_MS
    ) {
      lastUnknownKeyRefreshAt = currentTime;
      current = await refreshKeys();
      const rotated = current.keys.get(kid);
      if (rotated) return rotated;
    }
    unauthenticated();
  }

  return async function verifyFirebaseAppCheck(
    request: Request,
  ): Promise<VerifiedFirebaseAppCheckToken> {
    const token = request.headers.get(APP_CHECK_HEADER);
    if (
      !token || token.length > MAX_TOKEN_BYTES || /\s/u.test(token)
    ) {
      unauthenticated();
    }
    const segments = token.split(".");
    if (segments.length !== 3 || segments.some((segment) => !segment)) {
      unauthenticated();
    }

    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;
    let signature: Uint8Array<ArrayBuffer>;
    try {
      header = decodeJwtPart(segments[0]);
      claims = decodeJwtPart(segments[1]);
      signature = decodeBase64Url(segments[2]);
    } catch {
      unauthenticated();
    }
    if (
      header.alg !== "RS256" || header.typ !== "JWT" ||
      typeof header.kid !== "string" || !header.kid ||
      header.kid.length > 256
    ) {
      unauthenticated();
    }

    const key = await verificationKey(header.kid);
    let verified = false;
    try {
      verified = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        signature,
        utf8(`${segments[0]}.${segments[1]}`),
      );
    } catch {
      unauthenticated();
    }
    if (!verified) unauthenticated();

    const currentSeconds = Math.floor(now() / 1_000);
    if (
      claims.iss !== expectedIssuer ||
      !validAudience(claims.aud, expectedAudience) ||
      !validNumericDate(claims.exp) || claims.exp <= currentSeconds ||
      !validNumericDate(claims.iat) || claims.iat > currentSeconds ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > MAX_TOKEN_LIFETIME_SECONDS ||
      !validAppId(claims.sub)
    ) {
      unauthenticated();
    }

    return Object.freeze({
      appId: claims.sub,
      issuedAt: claims.iat,
      expiresAt: claims.exp,
    });
  };
}
