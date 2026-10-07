export const KEY_DISCOVERY_TIMEOUT_MS = 5_000;
export const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;

const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;

export function assertNetworkTimeoutMs(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < MIN_TIMEOUT_MS ||
    (value as number) > MAX_TIMEOUT_MS
  ) {
    throw new TypeError("Provider request timeout configuration is invalid.");
  }
  return value as number;
}

export function boundedTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(assertNetworkTimeoutMs(timeoutMs));
}
