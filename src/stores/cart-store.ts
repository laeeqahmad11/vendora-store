import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, Coupon } from '@/types'

interface CartState {
  items: CartItem[]
  coupon: { coupon: Coupon; discount: number } | null
  giftNote: string
  addItem: (item: CartItem) => void
  updateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void
  removeItem: (productId: string, variantId?: string) => void
  toggleSaveForLater: (productId: string, variantId?: string) => void
  setCoupon: (coupon: CartState['coupon']) => void
  setGiftNote: (note: string) => void
  clear: () => void
}

const keyOf = (i: { productId: string; variantId?: string }) => `${i.productId}::${i.variantId ?? ''}`

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      coupon: null,
      giftNote: '',

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => keyOf(i) === keyOf(item))
          if (existing) {
            const max = Math.min(existing.stock, existing.maxOrderQty ?? Infinity)
            return {
              items: state.items.map((i) =>
                keyOf(i) === keyOf(item)
                  ? { ...i, quantity: Math.min(i.quantity + item.quantity, max), savedForLater: false }
                  : i,
              ),
            }
          }
          return { items: [...state.items, item] }
        }),

      updateQuantity: (productId, variantId, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              keyOf(i) === keyOf({ productId, variantId })
                ? { ...i, quantity: Math.max(0, Math.min(quantity, i.stock, i.maxOrderQty ?? Infinity)) }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),

      removeItem: (productId, variantId) =>
        set((state) => ({
          items: state.items.filter((i) => keyOf(i) !== keyOf({ productId, variantId })),
          coupon: null,
        })),

      toggleSaveForLater: (productId, variantId) =>
        set((state) => ({
          items: state.items.map((i) =>
            keyOf(i) === keyOf({ productId, variantId }) ? { ...i, savedForLater: !i.savedForLater } : i,
          ),
        })),

      setCoupon: (coupon) => set({ coupon }),
      setGiftNote: (giftNote) => set({ giftNote }),
      clear: () => set({ items: [], coupon: null, giftNote: '' }),
    }),
    { name: 'vendora-cart' },
  ),
)

export const selectItems = (s: CartState) => s.items

export const getActiveItems = (items: CartItem[]) => items.filter((i) => !i.savedForLater)

export const getSavedItems = (items: CartItem[]) => items.filter((i) => i.savedForLater)

export const getSubtotal = (items: CartItem[]) =>
  getActiveItems(items).reduce((sum, i) => sum + i.price * i.quantity, 0)

export const getCount = (items: CartItem[]) =>
  getActiveItems(items).reduce((sum, i) => sum + i.quantity, 0)
