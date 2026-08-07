import type { ProductOptionRow } from './product-form.types'

export function parseProductOptions(rows: ProductOptionRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    const name = row.name.trim()
    const values = row.values
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
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
