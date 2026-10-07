import { createVerifiedActorFactory } from "../../functions/trusted/contracts.js";
import { SafeHttpError } from "./http-errors.js";
import { isValidHostedProjectId } from "./hosted-runtime.ts";
import {
  assertNetworkTimeoutMs,
  boundedTimeoutSignal,
  KEY_DISCOVERY_TIMEOUT_MS,
} from "./network-timeout.ts";
import { decodeBase64Url, decodeJwtPart, utf8 } from "./web-crypto.ts";

export const FIREBASE_SECURE_TOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const MAX_CACHE_SECONDS = 24 * 60 * 60;
const createHostedActor = createVerifiedActorFactory(
  "firebase-id-token-hosted",
);

interface KeyCache {
  readonly expiresAt: number;
  readonly keys: ReadonlyMap<string, CryptoKey>;
}

export interface FirebaseIdTokenResolverOptions {
  readonly projectId: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly fetchTimeoutMs?: number;
}

function unauthenticated(): never {
  throw new SafeHttpError(
    "unauthenticated",
    "Valid authentication is required.",
  );
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

export function createFirebaseIdTokenResolver({
  projectId,
  fetcher = globalThis.fetch,
  now = Date.now,
  fetchTimeoutMs = KEY_DISCOVERY_TIMEOUT_MS,
}: FirebaseIdTokenResolverOptions) {
  if (
    !isValidHostedProjectId(projectId) || typeof fetcher !== "function" ||
    typeof now !== "function" ||
    assertNetworkTimeoutMs(fetchTimeoutMs) !== fetchTimeoutMs
  ) {
    throw new TypeError("Firebase ID-token verifier configuration is invalid.");
  }
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  let cache: KeyCache | null = null;
  let refresh: Promise<KeyCache> | null = null;

  async function refreshKeys(): Promise<KeyCache> {
    if (refresh) return await refresh;
    refresh = (async () => {
      let response: Response;
      try {
        response = await fetcher(FIREBASE_SECURE_TOKEN_JWKS_URL, {
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
    const current = cache && now() < cache.expiresAt
      ? cache
      : await refreshKeys();
    return current.keys.get(kid) ?? unauthenticated();
  }

  return async function resolveFirebaseActor(request: Request) {
    const authorization = request.headers.get("authorization");
    const match = authorization && /^Bearer ([^\s]+)$/u.exec(authorization);
    if (!match) unauthenticated();
    const token = match[1];
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
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      !header.kid ||
      header.kid.length > 256 ||
      (header.typ !== undefined && header.typ !== "JWT")
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
      claims.aud !== projectId ||
      !validNumericDate(claims.exp) ||
      claims.exp <= currentSeconds ||
      !validNumericDate(claims.iat) ||
      claims.iat > currentSeconds ||
      claims.exp <= claims.iat ||
      typeof claims.sub !== "string" ||
      claims.sub.length === 0 ||
      claims.sub.length > 128
    ) {
      unauthenticated();
    }
    try {
      return createHostedActor(claims.sub);
    } catch {
      unauthenticated();
    }
  };
}
