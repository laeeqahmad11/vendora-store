import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { notation: n >= 10_000 ? 'compact' : 'standard' }).format(n)
}

export function formatDate(date: Date | number | string | undefined | null, format = 'MMM D, YYYY') {
  if (!date) return '—'
  return dayjs(date).format(format)
}

export function timeAgo(date: Date | number | string | undefined | null) {
  if (!date) return '—'
  return dayjs(date).fromNow()
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function truncate(text: string, length = 80) {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text
}

/** Discounted price for a product given its price + compareAtPrice */
export function discountPercent(price: number, compareAtPrice?: number | null) {
  if (!compareAtPrice || compareAtPrice <= price) return 0
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
}

export function initials(name?: string | null) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

/** Generates a human-friendly order number, e.g. VND-8F3K2Q */
export function generateOrderNumber() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `VND-${suffix}`
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Removes undefined values so Firestore writes don't reject the payload */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Firebase errors read like "Firebase: Error (auth/wrong-password)." — make them human
    const match = error.message.match(/\(auth\/([\w-]+)\)/)
    if (match) return AUTH_ERROR_MESSAGES[match[1]] ?? match[1].replace(/-/g, ' ')
    return error.message
  }
  return String(error)
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'invalid-credential': 'Incorrect email or password.',
  'wrong-password': 'Incorrect email or password.',
  'user-not-found': 'No account found with this email.',
  'email-already-in-use': 'An account with this email already exists.',
  'weak-password': 'Password should be at least 6 characters.',
  'too-many-requests': 'Too many attempts. Please try again later.',
  'popup-closed-by-user': 'Sign-in popup was closed before completing.',
  'network-request-failed': 'Network error. Check your connection and try again.',
}
