import type { ProductOptionRow } from './product-form.types'

export function parseProductOptions(rows: ProductOptionRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    const name = row.name.trim()
    const values = [...new Set(row.values
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean))]
    if (name && values.length) out[name] = values
  }
  return out
}

/** Cartesian product of option values → list of { OptionName: value } combos */
export function buildProductVariantCombos(options: Record<string, string[]>): Record<string, string>[] {
  const names = Object.keys(options)
  if (!names.length) return []
  return names.reduce<Record<string, string>[]>(
    (acc, name) => acc.flatMap((combo) => options[name].map((value) => ({ ...combo, [name]: value }))),
    [{}],
  )
}

export const productVariantComboKey = (combo: Record<string, string>) =>
  Object.keys(combo)
    .sort()
    .map((key) => `${key}:${combo[key]}`)
    .join('|')

export function productVariantId(combo: Record<string, string>): string {
  const key = productVariantComboKey(combo)
  let first = 2166136261
  let second = 2246822519
  for (let index = 0; index < key.length; index += 1) {
    first = Math.imul(first ^ key.charCodeAt(index), 16777619)
    second = Math.imul(second ^ key.charCodeAt(index), 3266489917)
  }
  const label = key
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 72)
  return `variant-${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}${label ? `-${label}` : ''}`
}
