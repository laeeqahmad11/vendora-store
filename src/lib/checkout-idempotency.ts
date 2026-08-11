import type { CheckoutIntent, CheckoutResult } from '@/services/checkout.service'

type MaterialCheckoutIntent = Omit<CheckoutIntent, 'idempotencyKey'>

interface CheckoutAttempt {
  checkoutSessionId: string
  createdAt: number
  fingerprint: string
  idempotencyKey: string
  state: 'pending' | 'completed'
  updatedAt: number
}

interface StoredCheckoutAttempts {
  attempts: CheckoutAttempt[]
  version: 1
}

export const CHECKOUT_ATTEMPTS_STORAGE_KEY = 'vendora-checkout-attempts-v1'

function normalizeOptional(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim()
}

/**
 * Mirrors the material part of parseCheckoutIntent in the callable. Keeping
 * this shape aligned with the server prevents whitespace/casing differences
 * from rotating a key when the backend would hash them as the same request.
 */
export function normalizeCheckoutIntent(intent: MaterialCheckoutIntent): MaterialCheckoutIntent {
  return {
    items: intent.items.map((item) => {
      const variantId = item.variantId?.trim()

      return {
        productId: item.productId.trim(),
        ...(variantId ? { variantId } : {}),
        quantity: item.quantity,
      }
    }),
    delivery: {
      fullName: intent.delivery.fullName.trim(),
      email: intent.delivery.email.trim(),
      phone: intent.delivery.phone.trim(),
      address: {
        fullName: intent.delivery.address.fullName.trim(),
        phone: intent.delivery.address.phone.trim(),
        line1: intent.delivery.address.line1.trim(),
        ...(intent.delivery.address.line2 !== undefined
          ? { line2: intent.delivery.address.line2.trim() }
          : {}),
        city: intent.delivery.address.city.trim(),
        province: intent.delivery.address.province.trim(),
        postalCode: intent.delivery.address.postalCode.trim(),
        country: intent.delivery.address.country.trim(),
      },
    },
    paymentMethod: 'cod',
    ...(intent.couponCode !== undefined ? { couponCode: intent.couponCode.trim().toUpperCase() } : {}),
    ...(intent.specialInstructions !== undefined
      ? {
          specialInstructions: normalizeOptional(intent.specialInstructions),
        }
      : {}),
    ...(intent.giftNote !== undefined ? { giftNote: normalizeOptional(intent.giftNote) } : {}),
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function fingerprintFor(
  customerId: string,
  checkoutSessionId: string,
  intent: MaterialCheckoutIntent,
): Promise<string> {
  return sha256(
    JSON.stringify({
      customerId,
      checkoutSessionId,
      intent,
    }),
  )
}

function isAttempt(value: unknown): value is CheckoutAttempt {
  if (!value || typeof value !== 'object') return false
  const attempt = value as Partial<CheckoutAttempt>

  return (
    typeof attempt.checkoutSessionId === 'string' &&
    typeof attempt.createdAt === 'number' &&
    typeof attempt.fingerprint === 'string' &&
    typeof attempt.idempotencyKey === 'string' &&
    (attempt.state === 'pending' || attempt.state === 'completed') &&
    typeof attempt.updatedAt === 'number'
  )
}

function readAttempts(): CheckoutAttempt[] {
  const serialized = localStorage.getItem(CHECKOUT_ATTEMPTS_STORAGE_KEY)

  if (!serialized) return []

  try {
    const stored = JSON.parse(serialized) as Partial<StoredCheckoutAttempts>

    if (stored.version !== 1 || !Array.isArray(stored.attempts)) {
      return []
    }

    return stored.attempts.filter(isAttempt)
  } catch {
    return []
  }
}

function writeAttempts(attempts: CheckoutAttempt[]): void {
  const value: StoredCheckoutAttempts = {
    version: 1,
    attempts,
  }

  try {
    localStorage.setItem(CHECKOUT_ATTEMPTS_STORAGE_KEY, JSON.stringify(value))
  } catch {
    throw new Error(
      'Checkout cannot safely continue because browser storage is unavailable. Enable site storage and try again.',
    )
  }
}

function acquireAttempt(checkoutSessionId: string, fingerprint: string): CheckoutAttempt {
  const attempts = readAttempts()
  const existing = attempts.find(
    (attempt) => attempt.checkoutSessionId === checkoutSessionId && attempt.fingerprint === fingerprint,
  )

  if (existing) return existing

  const now = Date.now()
  const attempt: CheckoutAttempt = {
    checkoutSessionId,
    createdAt: now,
    fingerprint,
    idempotencyKey: crypto.randomUUID(),
    state: 'pending',
    updatedAt: now,
  }

  writeAttempts([...attempts, attempt])
  return attempt
}

function completeAttempt(fingerprint: string): void {
  const attempts = readAttempts()
  const index = attempts.findIndex((attempt) => attempt.fingerprint === fingerprint)

  if (index < 0) return

  attempts[index] = {
    ...attempts[index],
    state: 'completed',
    updatedAt: Date.now(),
  }
  writeAttempts(attempts)
}

async function withAttemptLock<T>(fingerprint: string, operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return operation()

  return navigator.locks.request(`vendora-checkout-${fingerprint}`, operation)
}

/**
 * Persists the request identity before any network work. The lock makes tabs
 * sharing this browser origin acquire and use the same key sequentially.
 * Completed records are deliberately retired rather than deleted: an older
 * tab may still need the key to replay and recover the server result. A new
 * cart gets a new checkoutSessionId, so retired keys cannot affect it.
 */
export async function placeOrdersDurably(
  customerId: string,
  checkoutSessionId: string,
  intent: MaterialCheckoutIntent,
  placeOrders: (intent: CheckoutIntent) => Promise<CheckoutResult>,
): Promise<CheckoutResult> {
  const normalizedIntent = normalizeCheckoutIntent(intent)
  const fingerprint = await fingerprintFor(customerId, checkoutSessionId, normalizedIntent)

  return withAttemptLock(fingerprint, async () => {
    const attempt = acquireAttempt(checkoutSessionId, fingerprint)
    const result = await placeOrders({
      ...normalizedIntent,
      idempotencyKey: attempt.idempotencyKey,
    })

    completeAttempt(fingerprint)
    return result
  })
}
