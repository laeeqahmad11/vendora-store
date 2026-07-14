import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Banknote, CheckCircle2, MapPin, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Checkbox, Separator, Spinner } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { SEO } from '@/components/shared/seo'
import { usersService } from '@/services/users.service'
import { storesService } from '@/services/stores.service'
import { ordersService } from '@/services/orders.service'
import { discountsService } from '@/services/discounts.service'
import { useAuthStore } from '@/stores/auth-store'
import {
  useCartStore,
  selectItems,
  getActiveItems,
  getSubtotal,
} from '@/stores/cart-store'
import { cn, formatCurrency, getErrorMessage } from '@/lib/utils'
import type { CartItem, Order } from '@/types'

const checkoutSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(6, 'A valid phone number is required'),
  email: z.email('A valid email is required'),
  line1: z.string().min(3, 'Street address is required'),
  line2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  province: z.string().min(2, 'Province / state is required'),
  postalCode: z.string().min(2, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
  specialInstructions: z.string().optional(),
})

type CheckoutValues = z.infer<typeof checkoutSchema>

interface StoreGroup {
  storeId: string
  items: CartItem[]
  subtotal: number
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { firebaseUser, profile, initialized } = useAuthStore()

  const items = useCartStore(selectItems)
  const activeItems = React.useMemo(() => getActiveItems(items), [items])
  const subtotal = React.useMemo(() => getSubtotal(items), [items])

  const coupon = useCartStore((state) => state.coupon)
  const giftNote = useCartStore((state) => state.giftNote)
  const clearCart = useCartStore((state) => state.clear)

  const [saveAddress, setSaveAddress] = React.useState(false)
  const [selectedAddressId, setSelectedAddressId] = React.useState<string | null>(
    null,
  )
  const placedRef = React.useRef(false)

  React.useEffect(() => {
    if (initialized && !firebaseUser) {
      navigate('/auth/login', {
        state: { from: '/checkout' },
        replace: true,
      })
    }
  }, [initialized, firebaseUser, navigate])

  React.useEffect(() => {
    if (activeItems.length === 0 && !placedRef.current) {
      navigate('/cart', { replace: true })
    }
  }, [activeItems.length, navigate])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: profile?.displayName ?? '',
      phone: profile?.phone ?? '',
      email: profile?.email ?? '',
      line1: '',
      line2: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      specialInstructions: '',
    },
  })

  const addresses = useQuery({
    queryKey: ['addresses', firebaseUser?.uid],
    queryFn: () => usersService.listAddresses(firebaseUser!.uid),
    enabled: !!firebaseUser,
  })

  const applyAddress = (id: string) => {
    const address = addresses.data?.find((item) => item.id === id)

    if (!address) return

    setSelectedAddressId(id)

    reset({
      fullName: address.fullName,
      phone: address.phone,
      email: profile?.email ?? '',
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      country: address.country,
      specialInstructions: '',
    })
  }

  const groups: StoreGroup[] = React.useMemo(() => {
    const map = new Map<string, CartItem[]>()

    for (const item of activeItems) {
      map.set(item.storeId, [...(map.get(item.storeId) ?? []), item])
    }

    return [...map.entries()].map(([storeId, groupedItems]) => ({
      storeId,
      items: groupedItems,
      subtotal: groupedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      ),
    }))
  }, [activeItems])

  const storeIds = groups.map((group) => group.storeId)

  const stores = useQuery({
    queryKey: ['checkout-stores', storeIds],
    queryFn: async () =>
      Promise.all(storeIds.map((id) => storesService.getById(id))),
    enabled: storeIds.length > 0,
  })

  const discountFor = (group: StoreGroup): number => {
    if (!coupon) return 0

    const couponStoreId = coupon.coupon.storeId

    if (couponStoreId) {
      return couponStoreId === group.storeId
        ? Math.min(coupon.discount, group.subtotal)
        : 0
    }

    const eligibleTotal = groups.reduce(
      (sum, currentGroup) => sum + currentGroup.subtotal,
      0,
    )

    if (!eligibleTotal) return 0

    return (
      Math.round(
        ((coupon.discount * group.subtotal) / eligibleTotal) * 100,
      ) / 100
    )
  }

  const totalDiscount = groups.reduce(
    (sum, group) => sum + discountFor(group),
    0,
  )

  const total = Math.max(0, subtotal - totalDiscount)

  const placeOrder = useMutation({
    mutationFn: async (values: CheckoutValues) => {
      if (!firebaseUser) {
        throw new Error('You must be signed in to place an order.')
      }

      const shippingAddress = {
        fullName: values.fullName,
        phone: values.phone,
        line1: values.line1,
        ...(values.line2 ? { line2: values.line2 } : {}),
        city: values.city,
        province: values.province,
        postalCode: values.postalCode,
        country: values.country,
      }

      const orders: Omit<
        Order,
        | 'id'
        | 'orderNumber'
        | 'timeline'
        | 'status'
        | 'cashReceived'
        | 'createdAt'
        | 'updatedAt'
      >[] = groups.map((group) => {
        const store = stores.data?.find(
          (storeItem) => storeItem?.id === group.storeId,
        )

        const discount = discountFor(group)

        return {
          customerId: firebaseUser.uid,
          customerName: values.fullName,
          customerEmail: values.email,
          customerPhone: values.phone,
          storeId: group.storeId,
          merchantId: store?.ownerId ?? '',
          storeName: store?.name ?? group.items[0]?.storeName ?? 'Store',
          items: group.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            imageUrl: item.imageUrl,
            price: item.price,
            quantity: item.quantity,
            ...(item.variant ? { variant: item.variant } : {}),
            ...(item.variantId ? { variantId: item.variantId } : {}),
          })),
          subtotal: group.subtotal,
          discount,
          ...(discount > 0 && coupon?.coupon.code
            ? { couponCode: coupon.coupon.code }
            : {}),
          shippingFee: 0,
          tax: 0,
          total: Math.max(0, group.subtotal - discount),
          paymentMethod: 'cod' as const,
          shippingAddress,
          ...(values.specialInstructions
            ? { specialInstructions: values.specialInstructions }
            : {}),
          ...(giftNote ? { giftNote } : {}),
        }
      })

      const ids = await ordersService.placeOrders(orders, {
        id: firebaseUser.uid,
        name: values.fullName,
        role: 'customer',
      })

      if (coupon && totalDiscount > 0) {
        await discountsService.consumeCoupon(coupon.coupon.id)
      }

      if (saveAddress) {
        await usersService
          .addAddress(firebaseUser.uid, {
            label: 'Saved from checkout',
            ...shippingAddress,
          })
          .catch(() => {})
      }

      return {
        ids,
        orderNumbers: [] as string[],
      }
    },

    onSuccess: async ({ ids }) => {
      placedRef.current = true

      const created = await Promise.all(
        ids.map((id) => ordersService.getById(id).catch(() => null)),
      )

      const orderNumbers = created
        .filter((order): order is Order => Boolean(order))
        .map((order) => order.orderNumber)

      clearCart()

      navigate('/order-success', {
        state: {
          orderIds: ids,
          orderNumbers,
        },
        replace: true,
      })
    },

    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (
    !initialized ||
    (initialized && !firebaseUser) ||
    activeItems.length === 0
  ) {
    return <Spinner className="min-h-[50vh]" />
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8">
      <SEO title="Checkout" />

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Checkout
      </h1>

      <form
        className="mt-6 grid min-w-0 gap-6 lg:grid-cols-3 lg:gap-8"
        onSubmit={handleSubmit((values) => placeOrder.mutate(values))}
      >
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {(addresses.data?.length ?? 0) > 0 && (
            <Card className="p-4 sm:p-6">
              <h2 className="flex items-center gap-2 font-semibold">
                <MapPin className="size-4 text-primary" />
                Saved addresses
              </h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {addresses.data!.map((address) => (
                  <button
                    key={address.id}
                    type="button"
                    onClick={() => applyAddress(address.id)}
                    className={cn(
                      'min-w-0 rounded-xl border p-4 text-left text-sm transition-colors hover:border-primary/50',
                      selectedAddressId === address.id &&
                        'border-primary bg-primary/5',
                    )}
                  >
                    <p className="flex items-center justify-between gap-3 font-medium">
                      <span className="min-w-0 truncate">{address.label}</span>

                      {selectedAddressId === address.id && (
                        <CheckCircle2 className="size-4 shrink-0 text-primary" />
                      )}
                    </p>

                    <p className="mt-1 break-words text-muted-foreground">
                      {address.fullName} · {address.phone}
                    </p>

                    <p className="mt-0.5 break-words text-muted-foreground">
                      {address.line1}, {address.city}, {address.province}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 sm:p-6">
            <h2 className="font-semibold">Delivery details</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FormField
                label="Full name"
                required
                error={errors.fullName?.message}
              >
                <Input {...register('fullName')} autoComplete="name" />
              </FormField>

              <FormField
                label="Phone"
                required
                error={errors.phone?.message}
              >
                <Input {...register('phone')} type="tel" autoComplete="tel" />
              </FormField>

              <FormField
                label="Email"
                required
                error={errors.email?.message}
                className="sm:col-span-2"
              >
                <Input
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                />
              </FormField>

              <FormField
                label="Address line 1"
                required
                error={errors.line1?.message}
                className="sm:col-span-2"
              >
                <Input
                  {...register('line1')}
                  autoComplete="address-line1"
                  placeholder="Street address"
                />
              </FormField>

              <FormField
                label="Address line 2"
                error={errors.line2?.message}
                className="sm:col-span-2"
              >
                <Input
                  {...register('line2')}
                  autoComplete="address-line2"
                  placeholder="Apartment, suite, etc. (optional)"
                />
              </FormField>

              <FormField
                label="City"
                required
                error={errors.city?.message}
              >
                <Input
                  {...register('city')}
                  autoComplete="address-level2"
                />
              </FormField>

              <FormField
                label="Province / State"
                required
                error={errors.province?.message}
              >
                <Input
                  {...register('province')}
                  autoComplete="address-level1"
                />
              </FormField>

              <FormField
                label="Postal code"
                required
                error={errors.postalCode?.message}
              >
                <Input
                  {...register('postalCode')}
                  autoComplete="postal-code"
                />
              </FormField>

              <FormField
                label="Country"
                required
                error={errors.country?.message}
              >
                <Input
                  {...register('country')}
                  autoComplete="country-name"
                />
              </FormField>

              <FormField
                label="Special instructions"
                error={errors.specialInstructions?.message}
                className="sm:col-span-2"
              >
                <Textarea
                  {...register('specialInstructions')}
                  rows={4}
                  placeholder="Delivery notes for the courier (optional)"
                  className="resize-y"
                />
              </FormField>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={saveAddress}
                onCheckedChange={(checked) =>
                  setSaveAddress(checked === true)
                }
              />

              <span className="pt-0.5">Save this address for next time</span>
            </label>
          </Card>

          <Card className="p-4 sm:p-6">
            <h2 className="font-semibold">Payment method</h2>

            <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-3 sm:gap-4 sm:p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 sm:size-11">
                <Banknote className="size-5 text-primary" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Cash on Delivery</p>

                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Pay in cash when your order arrives at your door.
                </p>
              </div>

              <CheckCircle2
                className="size-5 shrink-0 text-primary"
                aria-label="Selected payment method"
              />
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShoppingBag className="size-4 text-primary" />
              Order summary
            </h2>

            <div className="mt-5 space-y-6">
              {groups.map((group) => {
                const store = stores.data?.find(
                  (storeItem) => storeItem?.id === group.storeId,
                )

                const discount = discountFor(group)

                return (
                  <div key={group.storeId} className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {store?.name ?? group.items[0]?.storeName ?? 'Store'}
                    </p>

                    <ul className="mt-2 space-y-2">
                      {group.items.map((item) => (
                        <li
                          key={`${item.productId}-${item.variantId ?? ''}`}
                          className="flex min-w-0 items-start justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 break-words">
                              {item.name}
                            </span>

                            <span className="text-xs text-muted-foreground">
                              × {item.quantity}
                            </span>
                          </span>

                          <span className="shrink-0 whitespace-nowrap font-medium">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-2 flex items-start justify-between gap-4 text-xs text-muted-foreground">
                      <span>Store subtotal</span>

                      <span className="shrink-0 whitespace-nowrap">
                        {formatCurrency(group.subtotal)}
                      </span>
                    </div>

                    {discount > 0 && (
                      <div className="mt-1 flex items-start justify-between gap-4 text-xs text-success">
                        <span>Discount</span>

                        <span className="shrink-0 whitespace-nowrap">
                          −{formatCurrency(discount)}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Separator className="my-4" />

            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Subtotal</dt>

                <dd className="shrink-0 whitespace-nowrap font-medium">
                  {formatCurrency(subtotal)}
                </dd>
              </div>

              {totalDiscount > 0 && (
                <div className="flex items-start justify-between gap-4 text-success">
                  <dt className="min-w-0 break-words">
                    Discount {coupon ? `(${coupon.coupon.code})` : ''}
                  </dt>

                  <dd className="shrink-0 whitespace-nowrap font-medium">
                    −{formatCurrency(totalDiscount)}
                  </dd>
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">Shipping</dt>

                <dd className="max-w-[60%] text-right text-xs leading-5 text-muted-foreground">
                  Calculated at delivery
                </dd>
              </div>
            </dl>

            <Separator className="my-4" />

            <div className="flex items-center justify-between gap-4 text-base font-bold">
              <span>Total</span>

              <span className="shrink-0 whitespace-nowrap">
                {formatCurrency(total)}
              </span>
            </div>

            {groups.length > 1 && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Your items come from {groups.length} stores — we&apos;ll place{' '}
                {groups.length} separate orders.
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-6 h-12 w-full"
              loading={placeOrder.isPending}
            >
              Place order
            </Button>

            <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
              By placing this order you agree to our{' '}
              <Link
                to="/pages/terms"
                className="underline underline-offset-2 hover:text-foreground"
              >
                terms of service
              </Link>
              .
            </p>
          </Card>
        </div>
      </form>
    </div>
  )
}