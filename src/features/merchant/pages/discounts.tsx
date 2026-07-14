import * as React from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  BadgePercent,
  CalendarClock,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { EmptyState, Switch } from '@/components/ui/misc'
import {
  TableSkeleton,
  Skeleton,
} from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { PageHeader } from '@/layouts/dashboard-layout'
import { discountsService } from '@/services/discounts.service'
import { productsService } from '@/services/products.service'
import {
  formatCurrency,
  formatDate,
  getErrorMessage,
} from '@/lib/utils'
import type {
  Coupon,
  DiscountType,
  Promotion,
} from '@/types'
import {
  ErrorState,
  ProductPicker,
  localInputToMs,
  msToLocalInput,
  useMerchant,
} from '../components/common'

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: 'Percentage',
  fixed: 'Fixed amount',
  bogo: 'Buy one get one',
  first_order: 'First order',
}

const PROMO_TYPES = [
  'flash_sale',
  'festival',
  'clearance',
  'banner',
] as const

type PromoType = (typeof PROMO_TYPES)[number]

const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  flash_sale: 'Flash sale',
  festival: 'Festival',
  clearance: 'Clearance',
  banner: 'Banner',
}

interface CouponFormState {
  code: string
  type: DiscountType
  value: string
  minOrderAmount: string
  maxDiscount: string
  usageLimit: string
  perCustomerLimit: string
  startsAt: string
  expiresAt: string
  active: boolean
  productIds: string[]
}

const emptyCoupon: CouponFormState = {
  code: '',
  type: 'percentage',
  value: '',
  minOrderAmount: '',
  maxDiscount: '',
  usageLimit: '',
  perCustomerLimit: '',
  startsAt: '',
  expiresAt: '',
  active: true,
  productIds: [],
}

const num = (value: string) => {
  const parsed = Number(value)

  return value.trim() !== '' && Number.isFinite(parsed)
    ? parsed
    : undefined
}

function CouponDialog({
  open,
  onOpenChange,
  editing,
  storeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Coupon | null
  storeId: string
}) {
  const queryClient = useQueryClient()
  const [form, setForm] =
    React.useState<CouponFormState>(emptyCoupon)

  const set = <K extends keyof CouponFormState>(
    key: K,
    value: CouponFormState[K],
  ) =>
    setForm((current) => ({
      ...current,
      [key]: value,
    }))

  const productsQ = useQuery({
    queryKey: ['merchant-products', storeId],
    queryFn: () => productsService.listByStore(storeId),
    enabled: open,
  })

  React.useEffect(() => {
    if (!open) return

    setForm(
      editing
        ? {
            code: editing.code,
            type: editing.type,
            value: String(editing.value),
            minOrderAmount:
              editing.minOrderAmount != null
                ? String(editing.minOrderAmount)
                : '',
            maxDiscount:
              editing.maxDiscount != null
                ? String(editing.maxDiscount)
                : '',
            usageLimit:
              editing.usageLimit != null
                ? String(editing.usageLimit)
                : '',
            perCustomerLimit:
              editing.perCustomerLimit != null
                ? String(editing.perCustomerLimit)
                : '',
            startsAt: msToLocalInput(editing.startsAt),
            expiresAt: msToLocalInput(editing.expiresAt),
            active: editing.active,
            productIds:
              editing.appliesTo?.productIds ?? [],
          }
        : emptyCoupon,
    )
  }, [open, editing])

  const mutation = useMutation({
    mutationFn: async () => {
      const code = form.code.trim().toUpperCase()

      if (code.length < 3) {
        throw new Error(
          'Coupon code must be at least 3 characters.',
        )
      }

      const value = num(form.value)

      if (value == null || value <= 0) {
        throw new Error(
          'Enter a valid discount value.',
        )
      }

      if (
        form.type === 'percentage' &&
        value > 100
      ) {
        throw new Error(
          'Percentage cannot exceed 100.',
        )
      }

      const payload = {
        storeId,
        code,
        type: form.type,
        value,
        minOrderAmount: num(form.minOrderAmount),
        maxDiscount: num(form.maxDiscount),
        usageLimit: num(form.usageLimit),
        perCustomerLimit: num(
          form.perCustomerLimit,
        ),
        startsAt: localInputToMs(form.startsAt),
        expiresAt: localInputToMs(
          form.expiresAt,
        ),
        active: form.active,
        appliesTo: form.productIds.length
          ? { productIds: form.productIds }
          : undefined,
      }

      if (editing) {
        await discountsService.updateCoupon(
          editing.id,
          payload,
        )
      } else {
        await discountsService.createCoupon(
          payload,
        )
      }
    },

    onSuccess: async () => {
      toast.success(
        editing
          ? 'Coupon updated'
          : 'Coupon created',
      )

      onOpenChange(false)

      await queryClient.invalidateQueries({
        queryKey: [
          'merchant-coupons',
          storeId,
        ],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>
            {editing
              ? 'Edit coupon'
              : 'Create coupon'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Code"
              required
            >
              <Input
                placeholder="SUMMER20"
                value={form.code}
                onChange={(event) =>
                  set(
                    'code',
                    event.target.value.toUpperCase(),
                  )
                }
              />
            </FormField>

            <FormField
              label="Type"
              required
            >
              <Select
                value={form.type}
                onValueChange={(value) =>
                  set(
                    'type',
                    value as DiscountType,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {(
                    Object.keys(
                      DISCOUNT_TYPE_LABELS,
                    ) as DiscountType[]
                  ).map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                    >
                      {
                        DISCOUNT_TYPE_LABELS[
                          type
                        ]
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              label={
                form.type === 'percentage'
                  ? 'Percent off'
                  : 'Amount'
              }
              required
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.value}
                onChange={(event) =>
                  set(
                    'value',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField label="Min order amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.minOrderAmount}
                onChange={(event) =>
                  set(
                    'minOrderAmount',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField label="Max discount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.maxDiscount}
                onChange={(event) =>
                  set(
                    'maxDiscount',
                    event.target.value,
                  )
                }
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Total usage limit">
              <Input
                type="number"
                min="0"
                placeholder="Unlimited"
                value={form.usageLimit}
                onChange={(event) =>
                  set(
                    'usageLimit',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField label="Per-customer limit">
              <Input
                type="number"
                min="0"
                placeholder="Unlimited"
                value={form.perCustomerLimit}
                onChange={(event) =>
                  set(
                    'perCustomerLimit',
                    event.target.value,
                  )
                }
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts at">
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  set(
                    'startsAt',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField label="Expires at">
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) =>
                  set(
                    'expiresAt',
                    event.target.value,
                  )
                }
              />
            </FormField>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-3">
            <Switch
              checked={form.active}
              onCheckedChange={(checked) =>
                set(
                  'active',
                  checked === true,
                )
              }
            />

            <span className="text-sm font-medium">
              Active
            </span>
          </div>

          <FormField
            label="Limit to specific products"
            hint="Leave empty to apply to all your products."
          >
            {productsQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ProductPicker
                products={productsQ.data ?? []}
                value={form.productIds}
                onChange={(ids) =>
                  set('productIds', ids)
                }
              />
            )}
          </FormField>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() =>
              onOpenChange(false)
            }
          >
            Cancel
          </Button>

          <Button
            type="button"
            className="w-full sm:w-auto"
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate()
            }
          >
            {editing
              ? 'Save changes'
              : 'Create coupon'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PromoFormState {
  title: string
  subtitle: string
  type: PromoType
  image: string[]
  productIds: string[]
  discountPercent: string
  startsAt: string
  endsAt: string
  active: boolean
}

const emptyPromo: PromoFormState = {
  title: '',
  subtitle: '',
  type: 'flash_sale',
  image: [],
  productIds: [],
  discountPercent: '',
  startsAt: '',
  endsAt: '',
  active: true,
}

function PromotionDialog({
  open,
  onOpenChange,
  editing,
  storeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Promotion | null
  storeId: string
}) {
  const queryClient = useQueryClient()
  const [form, setForm] =
    React.useState<PromoFormState>(emptyPromo)

  const set = <K extends keyof PromoFormState>(
    key: K,
    value: PromoFormState[K],
  ) =>
    setForm((current) => ({
      ...current,
      [key]: value,
    }))

  const productsQ = useQuery({
    queryKey: ['merchant-products', storeId],
    queryFn: () => productsService.listByStore(storeId),
    enabled: open,
  })

  React.useEffect(() => {
    if (!open) return

    setForm(
      editing
        ? {
            title: editing.title,
            subtitle: editing.subtitle ?? '',
            type: (
              PROMO_TYPES.includes(
                editing.type as PromoType,
              )
                ? editing.type
                : 'banner'
            ) as PromoType,
            image: editing.imageUrl
              ? [editing.imageUrl]
              : [],
            productIds:
              editing.productIds ?? [],
            discountPercent:
              editing.discountPercent != null
                ? String(
                    editing.discountPercent,
                  )
                : '',
            startsAt: msToLocalInput(
              editing.startsAt,
            ),
            endsAt: msToLocalInput(
              editing.endsAt,
            ),
            active: editing.active,
          }
        : emptyPromo,
    )
  }, [open, editing])

  const mutation = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 3) {
        throw new Error(
          'Title must be at least 3 characters.',
        )
      }

      const startsAt = localInputToMs(
        form.startsAt,
      )
      const endsAt = localInputToMs(form.endsAt)

      if (!startsAt || !endsAt) {
        throw new Error(
          'Start and end dates are required.',
        )
      }

      if (endsAt <= startsAt) {
        throw new Error(
          'End date must be after the start date.',
        )
      }

      const payload = {
        storeId,
        title: form.title.trim(),
        subtitle:
          form.subtitle.trim() || undefined,
        type: form.type,
        imageUrl: form.image[0],
        productIds: form.productIds,
        discountPercent: num(
          form.discountPercent,
        ),
        startsAt,
        endsAt,
        active: form.active,
      }

      if (editing) {
        await discountsService.updatePromotion(
          editing.id,
          payload,
        )
      } else {
        await discountsService.createPromotion(
          payload,
        )
      }
    },

    onSuccess: async () => {
      toast.success(
        editing
          ? 'Promotion updated'
          : 'Promotion created',
      )

      onOpenChange(false)

      await queryClient.invalidateQueries({
        queryKey: [
          'merchant-promotions',
          storeId,
        ],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>
            {editing
              ? 'Edit promotion'
              : 'Create promotion'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Title"
              required
            >
              <Input
                placeholder="Mid-season sale"
                value={form.title}
                onChange={(event) =>
                  set(
                    'title',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField
              label="Type"
              required
            >
              <Select
                value={form.type}
                onValueChange={(value) =>
                  set(
                    'type',
                    value as PromoType,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {PROMO_TYPES.map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                    >
                      {
                        PROMO_TYPE_LABELS[
                          type
                        ]
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Subtitle">
            <Textarea
              rows={2}
              placeholder="Up to 40% off selected items"
              value={form.subtitle}
              onChange={(event) =>
                set(
                  'subtitle',
                  event.target.value,
                )
              }
            />
          </FormField>

          <FormField label="Banner image">
            <ImageUploader
              value={form.image}
              onChange={(urls) =>
                set('image', urls)
              }
              folder={`stores/${storeId}/promotions`}
              max={1}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <FormField label="Discount %">
              <Input
                type="number"
                min="0"
                max="100"
                value={form.discountPercent}
                onChange={(event) =>
                  set(
                    'discountPercent',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField
              label="Starts at"
              required
            >
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  set(
                    'startsAt',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField
              label="Ends at"
              required
            >
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  set(
                    'endsAt',
                    event.target.value,
                  )
                }
              />
            </FormField>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-3">
            <Switch
              checked={form.active}
              onCheckedChange={(checked) =>
                set(
                  'active',
                  checked === true,
                )
              }
            />

            <span className="text-sm font-medium">
              Active
            </span>
          </div>

          <FormField label="Products in this promotion">
            {productsQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ProductPicker
                products={productsQ.data ?? []}
                value={form.productIds}
                onChange={(ids) =>
                  set('productIds', ids)
                }
              />
            )}
          </FormField>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() =>
              onOpenChange(false)
            }
          >
            Cancel
          </Button>

          <Button
            type="button"
            className="w-full sm:w-auto"
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate()
            }
          >
            {editing
              ? 'Save changes'
              : 'Create promotion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function DiscountsPage() {
  const { store } = useMerchant()
  const queryClient = useQueryClient()

  const [
    couponDialogOpen,
    setCouponDialogOpen,
  ] = React.useState(false)

  const [
    editingCoupon,
    setEditingCoupon,
  ] = React.useState<Coupon | null>(null)

  const [
    deletingCoupon,
    setDeletingCoupon,
  ] = React.useState<Coupon | null>(null)

  const [
    promoDialogOpen,
    setPromoDialogOpen,
  ] = React.useState(false)

  const [
    editingPromo,
    setEditingPromo,
  ] = React.useState<Promotion | null>(null)

  const [
    deletingPromo,
    setDeletingPromo,
  ] = React.useState<Promotion | null>(null)

  const couponsQ = useQuery({
    queryKey: ['merchant-coupons', store.id],
    queryFn: () =>
      discountsService.listCoupons(store.id),
  })

  const promotionsQ = useQuery({
    queryKey: ['merchant-promotions', store.id],
    queryFn: () =>
      discountsService.listPromotions(store.id),
  })

  const now = Date.now()

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Discounts"
        description="Coupons and promotional campaigns for your store."
      />

      <Tabs
        defaultValue="coupons"
        className="min-w-0"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex h-auto min-w-max">
            <TabsTrigger
              value="coupons"
              className="whitespace-nowrap px-4"
            >
              Coupons
            </TabsTrigger>

            <TabsTrigger
              value="promotions"
              className="whitespace-nowrap px-4"
            >
              Promotions
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="coupons"
          className="space-y-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                setEditingCoupon(null)
                setCouponDialogOpen(true)
              }}
            >
              <Plus className="size-4" />
              New coupon
            </Button>
          </div>

          {couponsQ.isLoading ? (
            <TableSkeleton rows={5} />
          ) : couponsQ.isError ? (
            <ErrorState
              onRetry={() =>
                void couponsQ.refetch()
              }
            />
          ) : (couponsQ.data ?? []).length ===
            0 ? (
            <EmptyState
              icon={BadgePercent}
              title="No coupons yet"
              description="Create discount codes your customers can apply at checkout."
              action={
                <Button
                  onClick={() => {
                    setEditingCoupon(null)
                    setCouponDialogOpen(true)
                  }}
                >
                  <Plus className="size-4" />
                  Create coupon
                </Button>
              }
            />
          ) : (
            <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
              <div className="max-h-[520px] overflow-auto">
                <Table className="min-w-[920px]">
                  <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="min-w-[130px]">
                        Code
                      </TableHead>

                      <TableHead className="min-w-[150px]">
                        Type
                      </TableHead>

                      <TableHead className="min-w-[170px]">
                        Value
                      </TableHead>

                      <TableHead className="min-w-[110px]">
                        Usage
                      </TableHead>

                      <TableHead className="min-w-[170px]">
                        Validity
                      </TableHead>

                      <TableHead className="min-w-[120px]">
                        Status
                      </TableHead>

                      <TableHead className="min-w-[110px] text-right" />
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {(couponsQ.data ?? []).map(
                      (coupon) => {
                        const expired =
                          !!coupon.expiresAt &&
                          coupon.expiresAt < now

                        return (
                          <TableRow
                            key={coupon.id}
                            className="transition-colors hover:bg-primary/[0.03]"
                          >
                            <TableCell className="whitespace-nowrap font-mono font-semibold">
                              {coupon.code}
                            </TableCell>

                            <TableCell>
                              {
                                DISCOUNT_TYPE_LABELS[
                                  coupon.type
                                ]
                              }
                            </TableCell>

                            <TableCell className="whitespace-nowrap font-medium">
                              {coupon.type ===
                              'percentage'
                                ? `${coupon.value}%`
                                : formatCurrency(
                                    coupon.value,
                                  )}

                              {coupon.maxDiscount
                                ? ` (max ${formatCurrency(
                                    coupon.maxDiscount,
                                  )})`
                                : ''}
                            </TableCell>

                            <TableCell className="whitespace-nowrap">
                              {coupon.usedCount}

                              {coupon.usageLimit
                                ? ` / ${coupon.usageLimit}`
                                : ''}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {coupon.expiresAt
                                ? `Until ${formatDate(
                                    coupon.expiresAt,
                                  )}`
                                : 'No expiry'}
                            </TableCell>

                            <TableCell>
                              {expired ? (
                                <Badge variant="secondary">
                                  Expired
                                </Badge>
                              ) : coupon.active ? (
                                <Badge variant="success">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  Inactive
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Edit coupon"
                                  onClick={() => {
                                    setEditingCoupon(
                                      coupon,
                                    )
                                    setCouponDialogOpen(
                                      true,
                                    )
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Delete coupon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setDeletingCoupon(
                                      coupon,
                                    )
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      },
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="promotions"
          className="space-y-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                setEditingPromo(null)
                setPromoDialogOpen(true)
              }}
            >
              <Plus className="size-4" />
              New promotion
            </Button>
          </div>

          {promotionsQ.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({
                length: 3,
              }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-64 w-full rounded-xl"
                />
              ))}
            </div>
          ) : promotionsQ.isError ? (
            <ErrorState
              onRetry={() =>
                void promotionsQ.refetch()
              }
            />
          ) : (promotionsQ.data ?? []).length ===
            0 ? (
            <EmptyState
              icon={Megaphone}
              title="No promotions yet"
              description="Run flash sales, festival campaigns or clearance events."
              action={
                <Button
                  onClick={() => {
                    setEditingPromo(null)
                    setPromoDialogOpen(true)
                  }}
                >
                  <Plus className="size-4" />
                  Create promotion
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {(promotionsQ.data ?? []).map(
                (promotion) => {
                  const live =
                    promotion.active &&
                    promotion.startsAt <= now &&
                    promotion.endsAt >= now

                  return (
                    <div
                      key={promotion.id}
                      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      {promotion.imageUrl ? (
                        <img
                          src={promotion.imageUrl}
                          alt=""
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-muted">
                          <Megaphone className="size-9 text-muted-foreground" />
                        </div>
                      )}

                      <div className="space-y-3 p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className="truncate font-semibold"
                              title={
                                promotion.title
                              }
                            >
                              {promotion.title}
                            </p>

                            {promotion.subtitle && (
                              <p
                                className="mt-0.5 truncate text-xs text-muted-foreground"
                                title={
                                  promotion.subtitle
                                }
                              >
                                {
                                  promotion.subtitle
                                }
                              </p>
                            )}
                          </div>

                          {live ? (
                            <Badge variant="success">
                              Live
                            </Badge>
                          ) : promotion.active ? (
                            <Badge>
                              Scheduled
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              Off
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">
                            {PROMO_TYPE_LABELS[
                              promotion.type as PromoType
                            ] ?? promotion.type}
                          </Badge>

                          {promotion.discountPercent !=
                            null && (
                            <span>
                              {
                                promotion.discountPercent
                              }
                              % off
                            </span>
                          )}

                          <span>
                            {promotion.productIds
                              ?.length ?? 0}{' '}
                            products
                          </span>
                        </div>

                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="mt-0.5 size-3.5 shrink-0" />

                          <span className="break-words">
                            {formatDate(
                              promotion.startsAt,
                            )}{' '}
                            →{' '}
                            {formatDate(
                              promotion.endsAt,
                            )}
                          </span>
                        </p>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setEditingPromo(
                                promotion,
                              )
                              setPromoDialogOpen(
                                true,
                              )
                            }}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-destructive hover:text-destructive"
                            onClick={() =>
                              setDeletingPromo(
                                promotion,
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                },
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CouponDialog
        open={couponDialogOpen}
        onOpenChange={setCouponDialogOpen}
        editing={editingCoupon}
        storeId={store.id}
      />

      <PromotionDialog
        open={promoDialogOpen}
        onOpenChange={setPromoDialogOpen}
        editing={editingPromo}
        storeId={store.id}
      />

      <ConfirmDialog
        open={!!deletingCoupon}
        onOpenChange={(open) =>
          !open && setDeletingCoupon(null)
        }
        title="Delete coupon?"
        description={`Coupon "${deletingCoupon?.code}" will stop working immediately.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deletingCoupon) return

          try {
            await discountsService.deleteCoupon(
              deletingCoupon.id,
            )

            toast.success('Coupon deleted')
            setDeletingCoupon(null)

            await queryClient.invalidateQueries({
              queryKey: [
                'merchant-coupons',
                store.id,
              ],
            })
          } catch (error) {
            toast.error(
              getErrorMessage(error),
            )
          }
        }}
      />

      <ConfirmDialog
        open={!!deletingPromo}
        onOpenChange={(open) =>
          !open && setDeletingPromo(null)
        }
        title="Delete promotion?"
        description={`"${deletingPromo?.title}" will be removed from the storefront.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deletingPromo) return

          try {
            await discountsService.deletePromotion(
              deletingPromo.id,
            )

            toast.success(
              'Promotion deleted',
            )

            setDeletingPromo(null)

            await queryClient.invalidateQueries({
              queryKey: [
                'merchant-promotions',
                store.id,
              ],
            })
          } catch (error) {
            toast.error(
              getErrorMessage(error),
            )
          }
        }}
      />
    </div>
  )
}