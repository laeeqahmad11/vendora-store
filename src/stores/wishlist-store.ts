import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WishlistState {
  productIds: string[]
  toggle: (productId: string) => void
  remove: (productId: string) => void
  has: (productId: string) => boolean
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      productIds: [],
      toggle: (productId) =>
        set((s) => ({
          productIds: s.productIds.includes(productId)
            ? s.productIds.filter((id) => id !== productId)
            : [...s.productIds, productId],
        })),
      remove: (productId) => set((s) => ({ productIds: s.productIds.filter((id) => id !== productId) })),
      has: (productId) => get().productIds.includes(productId),
    }),
    { name: 'vendora-wishlist' },
  ),
)
