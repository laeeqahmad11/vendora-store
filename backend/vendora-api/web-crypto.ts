export type JsonObject = Record<string, unknown>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(value));
}

export function encodeBase64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? utf8(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(
    /=+$/gu,
    "",
  );
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new TypeError("Encoded value is invalid.");
  }
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new TypeError("Encoded value is invalid.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeJwtPart(value: JsonObject): string {
  return encodeBase64Url(JSON.stringify(value));
}

export function decodeJwtPart(value: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(decodeBase64Url(value)));
  } catch {
    throw new TypeError("JWT value is invalid.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("JWT value is invalid.");
  }
  return parsed as JsonObject;
}

export function pkcs8FromPem(value: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string") throw new TypeError("Private key is invalid.");
  const match =
    /^-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PRIVATE KEY-----\r?\n?$/u
      .exec(value);
  if (!match) throw new TypeError("Private key is invalid.");
  const body = match[1].replace(/[\r\n]/gu, "");
  if (!body || body.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(body)) {
    throw new TypeError("Private key is invalid.");
  }
  let binary: string;
  try {
    binary = atob(body);
  } catch {
    throw new TypeError("Private key is invalid.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (!bytes.length) throw new TypeError("Private key is invalid.");
  return bytes;
}
