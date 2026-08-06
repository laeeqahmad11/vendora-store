import * as React from 'react'
import type { Product } from '@/types'

export function useProductSelection(visible: Product[]) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const toggleSelect = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })

  const allVisibleSelected = visible.length > 0 && visible.every((product) => selected.has(product.id))

  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((product) => product.id)))

  const clearSelection = () => setSelected(new Set())

  return {
    selected,
    setSelected,
    toggleSelect,
    allVisibleSelected,
    toggleSelectAll,
    clearSelection,
  }
}
