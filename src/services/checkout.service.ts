import { httpsCallable } from 'firebase/functions'

import { functions } from '@/lib/firebase'

export interface CheckoutIntent {
  items: {
    productId: string
    variantId?: string
    quantity: number
  }[]
  delivery: {
    fullName: string
    email: string
    phone: string
    address: {
      fullName: string
      phone: string
      line1: string
      line2?: string
      city: string
      province: string
      postalCode: string
      country: string
    }
  }
  couponCode?: string
  paymentMethod: 'cod'
  specialInstructions?: string
  giftNote?: string
  idempotencyKey: string
}

export interface CheckoutResult {
  orderIds: string[]
  orderNumbers: string[]
}

const placeOrders = httpsCallable<CheckoutIntent, CheckoutResult>(
  functions,
  'placeOrders',
)

const cancelOrder = httpsCallable<
  { orderId: string; reason: string },
  { orderId: string; status: 'cancelled' }
>(functions, 'cancelOrder')

export const checkoutService = {
  async placeOrders(intent: CheckoutIntent): Promise<CheckoutResult> {
    return (await placeOrders(intent)).data
  },

  async cancelOrder(orderId: string, reason: string): Promise<void> {
    await cancelOrder({ orderId, reason })
  },
}
