export type FirestoreValue =
  | { readonly nullValue: null }
  | { readonly booleanValue: boolean }
  | { readonly integerValue: string }
  | { readonly doubleValue: number }
  | { readonly stringValue: string }
  | { readonly timestampValue: string }
  | { readonly arrayValue: { readonly values?: readonly FirestoreValue[] } }
  | {
    readonly mapValue: {
      readonly fields?: Readonly<Record<string, FirestoreValue>>;
    };
  };

export interface FirestoreDocument {
  readonly name: string;
  readonly fields?: Readonly<Record<string, FirestoreValue>>;
  readonly createTime?: string;
  readonly updateTime?: string;
}

const MIN_TIMESTAMP_MILLIS = -62_135_596_800_000;
const MAX_TIMESTAMP_MILLIS = 253_402_300_799_999;
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/u;
const TIMESTAMP =
  /^(?:[0-9]{4})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,9})?Z$/u;
const FORBIDDEN_MAP_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function codecFailure(): never {
  throw new TypeError("Firestore value is unsupported or unsafe.");
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeFieldName(value: string): boolean {
  return value.length > 0 && !FORBIDDEN_MAP_KEYS.has(value) &&
    !value.includes("\u0000");
}

export function encodeFirestoreTimestamp(epochMillis: number): FirestoreValue {
  if (
    !Number.isSafeInteger(epochMillis) ||
    epochMillis < MIN_TIMESTAMP_MILLIS ||
    epochMillis > MAX_TIMESTAMP_MILLIS
  ) {
    codecFailure();
  }
  return { timestampValue: new Date(epochMillis).toISOString() };
}

export function decodeFirestoreTimestamp(value: unknown): number {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) codecFailure();
  const epochMillis = Date.parse(value);
  if (
    !Number.isSafeInteger(epochMillis) ||
    epochMillis < MIN_TIMESTAMP_MILLIS ||
    epochMillis > MAX_TIMESTAMP_MILLIS
  ) {
    codecFailure();
  }
  return epochMillis;
}

export function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) codecFailure();
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) codecFailure();
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: value.length
        ? { values: value.map((entry) => encodeFirestoreValue(entry)) }
        : {},
    };
  }
  if (plainObject(value)) {
    const fields: Record<string, FirestoreValue> = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      if (!safeFieldName(key)) codecFailure();
      fields[key] = encodeFirestoreValue(entry);
    }
    return { mapValue: Object.keys(fields).length ? { fields } : {} };
  }
  codecFailure();
}

function ownKeys(value: object): string[] {
  return Object.keys(value);
}

function exactVariant(
  value: Record<string, unknown>,
  key: string,
): boolean {
  const keys = ownKeys(value);
  return keys.length === 1 && keys[0] === key;
}

export function decodeFirestoreValue(value: unknown): unknown {
  if (!plainObject(value)) codecFailure();
  if (exactVariant(value, "nullValue")) {
    if (value.nullValue !== null) codecFailure();
    return null;
  }
  if (exactVariant(value, "booleanValue")) {
    if (typeof value.booleanValue !== "boolean") codecFailure();
    return value.booleanValue;
  }
  if (exactVariant(value, "integerValue")) {
    if (
      typeof value.integerValue !== "string" ||
      !INTEGER.test(value.integerValue)
    ) {
      codecFailure();
    }
    const integer = Number(value.integerValue);
    if (!Number.isSafeInteger(integer)) codecFailure();
    return integer;
  }
  if (exactVariant(value, "doubleValue")) {
    if (
      typeof value.doubleValue !== "number" ||
      !Number.isFinite(value.doubleValue)
    ) {
      codecFailure();
    }
    return value.doubleValue;
  }
  if (exactVariant(value, "stringValue")) {
    if (typeof value.stringValue !== "string") codecFailure();
    return value.stringValue;
  }
  if (exactVariant(value, "timestampValue")) {
    return decodeFirestoreTimestamp(value.timestampValue);
  }
  if (exactVariant(value, "arrayValue")) {
    if (!plainObject(value.arrayValue)) codecFailure();
    const keys = ownKeys(value.arrayValue);
    if (keys.some((key) => key !== "values")) codecFailure();
    if (value.arrayValue.values === undefined) return [];
    if (!Array.isArray(value.arrayValue.values)) codecFailure();
    return value.arrayValue.values.map((entry) => decodeFirestoreValue(entry));
  }
  if (exactVariant(value, "mapValue")) {
    if (!plainObject(value.mapValue)) codecFailure();
    const keys = ownKeys(value.mapValue);
    if (keys.some((key) => key !== "fields")) codecFailure();
    const result: Record<string, unknown> = {};
    if (value.mapValue.fields === undefined) return result;
    if (!plainObject(value.mapValue.fields)) codecFailure();
    for (const [key, entry] of Object.entries(value.mapValue.fields)) {
      if (!safeFieldName(key)) codecFailure();
      result[key] = decodeFirestoreValue(entry);
    }
    return result;
  }
  codecFailure();
}

export function encodeFirestoreFields(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, FirestoreValue>> {
  if (!plainObject(value)) codecFailure();
  const encoded = encodeFirestoreValue(value);
  if (!("mapValue" in encoded)) codecFailure();
  return encoded.mapValue.fields ?? Object.freeze({});
}

export function decodeFirestoreFields(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (value === undefined) return Object.freeze({});
  if (!plainObject(value)) codecFailure();
  const decoded = decodeFirestoreValue({ mapValue: { fields: value } });
  if (!plainObject(decoded)) codecFailure();
  return decoded;
}
