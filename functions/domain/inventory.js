import { containsControlCharacter } from './identifiers.js'
import { domainFail } from './errors.js'

export const DEFAULT_MAX_PRODUCT_VARIANTS = 500

export function authoritativeProductInventory(
  product,
  message,
  fail = domainFail,
  maximumVariants = DEFAULT_MAX_PRODUCT_VARIANTS,
) {
  const variants = product.variants
  if (variants === undefined || variants === null || (Array.isArray(variants) && variants.length === 0)) {
    if (!Number.isSafeInteger(product.stock) || product.stock < 0) {
      fail('failed-precondition', message)
    }
    return { hasVariants: false, stock: product.stock, variants: [], byId: new Map() }
  }
  if (!Array.isArray(variants) || variants.length > maximumVariants) {
    fail('failed-precondition', message)
  }

  const byId = new Map()
  const combinations = new Set()
  let stock = 0
  for (const variant of variants) {
    if (
      variant === null ||
      typeof variant !== 'object' ||
      Array.isArray(variant) ||
      typeof variant.id !== 'string' ||
      !variant.id ||
      variant.id.length > 128 ||
      variant.id.includes('/') ||
      containsControlCharacter(variant.id) ||
      byId.has(variant.id) ||
      variant.options === null ||
      typeof variant.options !== 'object' ||
      Array.isArray(variant.options) ||
      Object.keys(variant.options).length === 0 ||
      !Number.isSafeInteger(variant.stock) ||
      variant.stock < 0
    ) {
      fail('failed-precondition', message)
    }
    const optionEntries = Object.entries(variant.options).sort(([left], [right]) => left.localeCompare(right))
    if (
      optionEntries.some(
        ([name, value]) =>
          !name.trim() ||
          typeof value !== 'string' ||
          !value.trim() ||
          containsControlCharacter(name) ||
          containsControlCharacter(value),
      )
    ) {
      fail('failed-precondition', message)
    }
    const combination = JSON.stringify(optionEntries)
    if (combinations.has(combination)) fail('failed-precondition', message)
    combinations.add(combination)
    byId.set(variant.id, variant)
    stock += variant.stock
    if (!Number.isSafeInteger(stock)) fail('failed-precondition', message)
  }
  if (product.stock !== stock) fail('failed-precondition', message)
  return { hasVariants: true, stock, variants, byId }
}
