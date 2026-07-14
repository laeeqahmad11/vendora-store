import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RecentlyViewedState {
  productIds: string[]
  add: (productId: string) => void
}

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      productIds: [],
      add: (productId) =>
        set((s) => ({
          productIds: [productId, ...s.productIds.filter((id) => id !== productId)].slice(0, 12),
        })),
    }),
    { name: 'vendora-recently-viewed' },
  ),
)
