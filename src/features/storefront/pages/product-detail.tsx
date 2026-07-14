import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  BadgeCheck,
  Check,
  Flag,
  Heart,
  Minus,
  PackageX,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingCart,
  ThumbsUp,
  Truck,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea, Input } from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Avatar,
  EmptyState,
  RatingStars,
  Separator,
  Spinner,
} from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import {
  PriceDisplay,
  effectivePrice,
} from '@/components/shared/price'
import { ImageUploader } from '@/components/shared/image-uploader'
import { productsService } from '@/services/products.service'
import { storesService } from '@/services/stores.service'
import { reviewsService } from '@/services/reviews.service'
import { useAuthStore } from '@/stores/auth-store'
import { useCartStore } from '@/stores/cart-store'
import { useWishlistStore } from '@/stores/wishlist-store'
import { useRecentlyViewedStore } from '@/stores/recently-viewed-store'
import { useRealtimeDoc } from '@/hooks/use-realtime'
import { COLLECTIONS } from '@/lib/constants'
import {
  cn,
  clamp,
  getErrorMessage,
  timeAgo,
} from '@/lib/utils'
import { ProductShelf } from '../components/product-shelf'
import { RecentlyViewedShelf } from '../components/recently-viewed-shelf'
import { Countdown } from '../components/countdown'
import type { Product, Review } from '@/types'

// ------------------------------------------------------------- Gallery

function Gallery({ product }: { product: Product }) {
  const [index, setIndex] = React.useState(0)
  const [zoom, setZoom] = React.useState(false)
  const [origin, setOrigin] = React.useState('50% 50%')

  const image = product.images[index]

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-square overflow-hidden rounded-2xl border bg-muted"
        onMouseEnter={() => setZoom(true)}
        onMouseLeave={() => setZoom(false)}
        onMouseMove={(event) => {
          const rect =
            event.currentTarget.getBoundingClientRect()

          const x =
            ((event.clientX - rect.left) /
              rect.width) *
            100

          const y =
            ((event.clientY - rect.top) /
              rect.height) *
            100

          setOrigin(`${x}% ${y}%`)
        }}
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="size-full object-cover transition-transform duration-200"
            style={{
              transformOrigin: origin,
              transform: zoom
                ? 'scale(1.8)'
                : 'scale(1)',
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ShoppingCart className="size-16 opacity-20" />
          </div>
        )}
      </div>

      {product.images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {product.images.map(
            (imageUrl, imageIndex) => (
              <button
                key={imageUrl}
                type="button"
                onClick={() =>
                  setIndex(imageIndex)
                }
                aria-label={`View image ${
                  imageIndex + 1
                }`}
                className={cn(
                  'size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                  imageIndex === index
                    ? 'border-primary'
                    : 'border-transparent hover:border-border',
                )}
              >
                <img
                  src={imageUrl}
                  alt=""
                  className="size-full object-cover"
                />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------- Review section

function ReviewForm({
  product,
}: {
  product: Product
}) {
  const { firebaseUser, profile } =
    useAuthStore()

  const queryClient = useQueryClient()

  const [rating, setRating] =
    React.useState(0)
  const [title, setTitle] =
    React.useState('')
  const [comment, setComment] =
    React.useState('')
  const [images, setImages] =
    React.useState<string[]>([])

  const create = useMutation({
    mutationFn: () =>
      reviewsService.create({
        productId: product.id,
        storeId: product.storeId,
        customerId: firebaseUser!.uid,
        customerName:
          profile?.displayName ??
          'Customer',
        rating,
        title:
          title.trim() || undefined,
        comment: comment.trim(),
        images:
          images.length
            ? images
            : undefined,
      }),

    onSuccess: () => {
      toast.success(
        'Thanks for your review!',
      )

      setRating(0)
      setTitle('')
      setComment('')
      setImages([])

      void queryClient.invalidateQueries({
        queryKey: [
          'reviews',
          product.id,
        ],
      })

      void queryClient.invalidateQueries({
        queryKey: [
          'product',
          product.slug,
        ],
      })
    },

    onError: (error) =>
      toast.error(
        getErrorMessage(error),
      ),
  })

  if (!firebaseUser) {
    return (
      <div className="rounded-xl border bg-muted/40 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          <Link
            to="/auth/login"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>{' '}
          to write a review.
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault()

        if (!rating) {
          toast.error(
            'Please select a star rating.',
          )
          return
        }

        if (!comment.trim()) {
          toast.error(
            'Please write a few words about the product.',
          )
          return
        }

        create.mutate()
      }}
    >
      <h4 className="font-semibold">
        Write a review
      </h4>

      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          Your rating
        </p>

        <RatingStars
          rating={rating}
          size="lg"
          interactive
          onChange={setRating}
        />
      </div>

      <Input
        value={title}
        onChange={(event) =>
          setTitle(event.target.value)
        }
        placeholder="Review title (optional)"
        maxLength={100}
      />

      <Textarea
        value={comment}
        onChange={(event) =>
          setComment(event.target.value)
        }
        placeholder="What did you like or dislike?"
        required
      />

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          Add photos (optional)
        </p>

        <ImageUploader
          value={images}
          onChange={setImages}
          folder={`reviews/${product.id}`}
          max={4}
        />
      </div>

      <Button
        type="submit"
        loading={create.isPending}
      >
        Submit review
      </Button>
    </form>
  )
}

function ReviewCard({
  review,
}: {
  review: Review
}) {
  const queryClient = useQueryClient()

  const [voted, setVoted] =
    React.useState(false)
  const [reported, setReported] =
    React.useState(false)

  const helpful = useMutation({
    mutationFn: () =>
      reviewsService.markHelpful(
        review.id,
      ),

    onSuccess: () => {
      setVoted(true)

      void queryClient.invalidateQueries({
        queryKey: [
          'reviews',
          review.productId,
        ],
      })
    },
  })

  const report = useMutation({
    mutationFn: () =>
      reviewsService.report(review.id),

    onSuccess: () => {
      setReported(true)

      toast.success(
        'Review reported. Our team will take a look.',
      )
    },
  })

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={review.customerName}
          />

          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {review.customerName}

              {review.orderId && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-success">
                  <BadgeCheck className="size-3.5" />
                  Verified purchase
                </span>
              )}
            </p>

            <p className="text-xs text-muted-foreground">
              {timeAgo(review.createdAt)}
            </p>
          </div>
        </div>

        <RatingStars
          rating={review.rating}
        />
      </div>

      {review.title && (
        <h5 className="mt-3 text-sm font-semibold">
          {review.title}
        </h5>
      )}

      <p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">
        {review.comment}
      </p>

      {review.images &&
        review.images.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {review.images.map(
              (imageUrl) => (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt="Review"
                  loading="lazy"
                  className="size-16 shrink-0 rounded-lg border object-cover"
                />
              ),
            )}
          </div>
        )}

      {review.reply && (
        <div className="mt-3 rounded-lg bg-muted/60 p-3">
          <p className="text-xs font-semibold">
            Seller response
          </p>

          <p className="mt-1 break-words text-sm text-muted-foreground">
            {review.reply.text}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={
            voted || helpful.isPending
          }
          onClick={() =>
            helpful.mutate()
          }
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60',
            voted && 'text-primary',
          )}
        >
          <ThumbsUp className="size-3.5" />
          Helpful (
          {review.helpfulCount +
            (voted ? 1 : 0)}
          )
        </button>

        <button
          type="button"
          disabled={
            reported || report.isPending
          }
          onClick={() =>
            report.mutate()
          }
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
        >
          <Flag className="size-3.5" />
          {reported
            ? 'Reported'
            : 'Report'}
        </button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- Page

export default function ProductDetailPage() {
  const { slug = '' } = useParams()

  const navigate = useNavigate()

  const addItem = useCartStore(
    (state) => state.addItem,
  )

  const inWishlist =
    useWishlistStore(
      (state) => state.productIds,
    )

  const toggleWishlist =
    useWishlistStore(
      (state) => state.toggle,
    )

  const addRecentlyViewed =
    useRecentlyViewedStore(
      (state) => state.add,
    )

  const {
    data: fetched,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['product', slug],
    queryFn: () =>
      productsService.getBySlug(slug),
    enabled: !!slug,
  })

  const live = useRealtimeDoc<Product>(
    COLLECTIONS.products,
    fetched?.id,
  )

  const product = live.data ?? fetched

  const { data: store } = useQuery({
    queryKey: [
      'store',
      product?.storeId,
    ],
    queryFn: () =>
      storesService.getById(
        product!.storeId,
      ),
    enabled: !!product?.storeId,
  })

  const {
    data: reviews,
    isLoading: reviewsLoading,
  } = useQuery({
    queryKey: [
      'reviews',
      product?.id,
    ],
    queryFn: () =>
      reviewsService.listForProduct(
        product!.id,
      ),
    enabled: !!product?.id,
  })

  const {
    data: related,
    isLoading: relatedLoading,
  } = useQuery({
    queryKey: [
      'products',
      'related',
      product?.categoryId,
      product?.id,
    ],

    queryFn: () =>
      productsService.listPublic(
        {
          categoryId:
            product!.categoryId,
        },
        undefined,
        9,
      ),

    enabled: !!product?.categoryId,

    select: (response) =>
      response.items
        .filter(
          (item) =>
            item.id !== product?.id,
        )
        .slice(0, 8),
  })

  const [selected, setSelected] =
    React.useState<
      Record<string, string>
    >({})

  const [quantity, setQuantity] =
    React.useState(1)

  React.useEffect(() => {
    if (!product?.id) return

    productsService.incrementView(
      product.id,
    )

    addRecentlyViewed(product.id)
    setSelected({})
    setQuantity(
      product.minOrderQty ?? 1,
    )
  }, [
    product?.id,
    product?.minOrderQty,
    addRecentlyViewed,
  ])

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2">
        <Skeleton className="aspect-square rounded-2xl" />

        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={PackageX}
          title="Product not found"
          description="This product may have been removed or the link is incorrect."
          action={
            <Button asChild>
              <Link to="/shop">
                Back to shop
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  const optionNames = Object.keys(
    product.variantOptions ?? {},
  )

  const hasOptions =
    optionNames.length > 0

  const matchedVariant = hasOptions
    ? product.variants?.find(
        (variant) =>
          optionNames.every(
            (name) =>
              variant.options[name] ===
              selected[name],
          ),
      )
    : undefined

  const allSelected =
    optionNames.every(
      (name) => selected[name],
    )

  const base =
    effectivePrice(product)

  const unitPrice =
    matchedVariant?.price ??
    base.price

  const availableStock =
    matchedVariant
      ? matchedVariant.stock
      : product.stock

  const minQty =
    product.minOrderQty ?? 1

  const maxQty = Math.min(
    availableStock,
    product.maxOrderQty ??
      Infinity,
  )

  const outOfStock =
    availableStock <= 0

  const wishlisted =
    inWishlist.includes(product.id)

  const flashActive =
    !!product.flashSale?.active &&
    product.flashSale.endsAt >
      Date.now()

  const buildCartItem = () => ({
    productId: product.id,
    storeId: product.storeId,
    storeName: store?.name ?? '',
    name: product.name,
    imageUrl:
      matchedVariant?.imageUrl ??
      product.images[0],
    price: unitPrice,
    quantity: clamp(
      quantity,
      minQty,
      Math.max(minQty, maxQty),
    ),
    stock: availableStock,
    maxOrderQty:
      product.maxOrderQty,
    variantId: matchedVariant?.id,
    variant:
      matchedVariant?.options,
  })

  const validateSelection = () => {
    if (
      hasOptions &&
      !allSelected
    ) {
      toast.error(
        'Please choose your options first.',
      )
      return false
    }

    if (outOfStock) {
      toast.error(
        'This item is out of stock.',
      )
      return false
    }

    return true
  }

  const handleAddToCart = () => {
    if (!validateSelection()) return

    addItem(buildCartItem())

    toast.success('Added to cart')
  }

  const handleBuyNow = () => {
    if (!validateSelection()) return

    addItem(buildCartItem())
    navigate('/checkout')
  }

  const handleShare = async () => {
    const url = window.location.href

    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          url,
        })
      } else {
        await navigator.clipboard.writeText(
          url,
        )

        toast.success(
          'Link copied to clipboard',
        )
      }
    } catch {
      // User dismissed the native share sheet.
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO
        title={product.name}
        description={
          product.seo?.description ??
          product.description.slice(
            0,
            160,
          )
        }
      />

      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery product={product} />

        <motion.div
          initial={{
            opacity: 0,
            y: 12,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            {flashActive && (
              <Badge variant="warning">
                <Zap className="size-3" />
                Flash sale
              </Badge>
            )}

            {product.compareAtPrice &&
              product.compareAtPrice >
                product.price &&
              !flashActive && (
                <Badge variant="destructive">
                  Sale
                </Badge>
              )}

            {outOfStock ? (
              <Badge variant="secondary">
                Out of stock
              </Badge>
            ) : availableStock <=
              (product.lowStockThreshold ??
                5) ? (
              <Badge variant="warning">
                Only {availableStock} left
              </Badge>
            ) : (
              <Badge variant="success">
                In stock
              </Badge>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {product.name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <RatingStars
                rating={product.rating}
                count={
                  product.ratingCount
                }
              />

              {product.soldCount > 0 && (
                <span>
                  {product.soldCount} sold
                </span>
              )}

              {product.sku && (
                <span>
                  SKU: {product.sku}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {matchedVariant?.price !=
            null ? (
              <span className="text-2xl font-bold tracking-tight">
                {new Intl.NumberFormat(
                  'en-US',
                  {
                    style: 'currency',
                    currency:
                      product.currency ||
                      'USD',
                  },
                ).format(
                  matchedVariant.price,
                )}
              </span>
            ) : (
              <PriceDisplay
                product={product}
                size="lg"
              />
            )}

            {flashActive && (
              <Countdown
                endsAt={
                  product.flashSale!
                    .endsAt
                }
              />
            )}
          </div>

          {optionNames.map((name) => (
            <div key={name}>
              <p className="mb-2 text-sm font-medium">
                {name}

                {selected[name] && (
                  <span className="ml-1 text-muted-foreground">
                    — {selected[name]}
                  </span>
                )}
              </p>

              <div className="flex flex-wrap gap-2">
                {(
                  product.variantOptions?.[
                    name
                  ] ?? []
                ).map((value) => {
                  const isActive =
                    selected[name] ===
                    value

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setSelected(
                          (current) => ({
                            ...current,
                            [name]: value,
                          }),
                        )
                      }
                      className={cn(
                        'rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'hover:border-primary/40 hover:bg-accent',
                      )}
                      aria-pressed={
                        isActive
                      }
                    >
                      {isActive && (
                        <Check className="mr-1 inline size-3" />
                      )}

                      {value}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {hasOptions &&
            allSelected &&
            !matchedVariant && (
              <p className="text-sm text-destructive">
                This combination is
                unavailable.
              </p>
            )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium">
                Quantity
              </p>

              <div className="flex items-center rounded-lg border">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Decrease quantity"
                  disabled={
                    quantity <= minQty
                  }
                  onClick={() =>
                    setQuantity((current) =>
                      Math.max(
                        minQty,
                        current - 1,
                      ),
                    )
                  }
                >
                  <Minus />
                </Button>

                <span className="w-10 text-center text-sm font-semibold tabular-nums">
                  {quantity}
                </span>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Increase quantity"
                  disabled={
                    quantity >= maxQty
                  }
                  onClick={() =>
                    setQuantity((current) =>
                      Math.min(
                        Math.max(
                          minQty,
                          maxQty,
                        ),
                        current + 1,
                      ),
                    )
                  }
                >
                  <Plus />
                </Button>
              </div>

              {product.minOrderQty &&
                product.minOrderQty >
                  1 && (
                  <span className="text-xs text-muted-foreground">
                    Min.{' '}
                    {
                      product.minOrderQty
                    }
                  </span>
                )}

              {product.maxOrderQty && (
                <span className="text-xs text-muted-foreground">
                  Max.{' '}
                  {product.maxOrderQty}{' '}
                  per order
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                size="lg"
                className="col-span-1 w-full sm:w-auto sm:px-10"
                disabled={outOfStock}
                onClick={
                  handleAddToCart
                }
              >
                <ShoppingCart />
                Add to cart
              </Button>

              <Button
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={outOfStock}
                onClick={handleBuyNow}
              >
                Buy now
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                aria-label={
                  wishlisted
                    ? 'Remove from wishlist'
                    : 'Add to wishlist'
                }
                onClick={() => {
                  toggleWishlist(
                    product.id,
                  )

                  toast.success(
                    wishlisted
                      ? 'Removed from wishlist'
                      : 'Added to wishlist',
                  )
                }}
              >
                <Heart
                  className={cn(
                    wishlisted &&
                      'fill-red-500 text-red-500',
                  )}
                />
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                aria-label="Share product"
                onClick={handleShare}
              >
                <Share2 />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Truck className="size-4 text-primary" />
              Cash on delivery
            </span>

            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Buyer protection
            </span>
          </div>

          {store && (
            <>
              <Separator />

              <Link
                to={`/stores/${store.slug}`}
                className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <Avatar
                  src={store.logoUrl}
                  name={store.name}
                  className="size-12"
                />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate font-semibold">
                    {store.name}

                    {store.verified && (
                      <BadgeCheck className="size-4 shrink-0 text-primary" />
                    )}
                  </p>

                  <RatingStars
                    rating={store.rating}
                    count={
                      store.ratingCount
                    }
                  />
                </div>

                <span className="shrink-0 whitespace-nowrap text-sm font-medium text-primary">
                  Visit store →
                </span>
              </Link>
            </>
          )}
        </motion.div>
      </div>

      <div className="mt-12 min-w-0">
        <Tabs
          defaultValue="description"
          className="min-w-0"
        >
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex h-auto min-w-max whitespace-nowrap">
              <TabsTrigger
                value="description"
                className="shrink-0"
              >
                Description
              </TabsTrigger>

              <TabsTrigger
                value="specs"
                className="shrink-0"
              >
                Specifications
              </TabsTrigger>

              <TabsTrigger
                value="shipping"
                className="shrink-0"
              >
                Shipping &amp; Returns
              </TabsTrigger>

              <TabsTrigger
                value="reviews"
                className="shrink-0"
              >
                Reviews (
                {product.ratingCount})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="description">
            <div className="max-w-3xl whitespace-pre-line rounded-xl border bg-card p-4 text-sm leading-relaxed text-muted-foreground sm:p-6">
              {product.description ||
                'No description provided.'}
            </div>
          </TabsContent>

          <TabsContent value="specs">
            <div className="max-w-3xl overflow-hidden rounded-xl border bg-card">
              {product.specifications
                ?.length ||
              product.weight ||
              product.dimensions ||
              product.warranty ? (
                <dl className="divide-y">
                  {(
                    product.specifications ??
                    []
                  ).map((spec) => (
                    <div
                      key={spec.label}
                      className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-2 sm:gap-4 sm:px-6"
                    >
                      <dt className="font-medium">
                        {spec.label}
                      </dt>

                      <dd className="break-words text-muted-foreground">
                        {spec.value}
                      </dd>
                    </div>
                  ))}

                  {product.weight && (
                    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-2 sm:gap-4 sm:px-6">
                      <dt className="font-medium">
                        Weight
                      </dt>

                      <dd className="break-words text-muted-foreground">
                        {product.weight}
                      </dd>
                    </div>
                  )}

                  {product.dimensions && (
                    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-2 sm:gap-4 sm:px-6">
                      <dt className="font-medium">
                        Dimensions
                      </dt>

                      <dd className="break-words text-muted-foreground">
                        {
                          product.dimensions
                        }
                      </dd>
                    </div>
                  )}

                  {product.warranty && (
                    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-2 sm:gap-4 sm:px-6">
                      <dt className="font-medium">
                        Warranty
                      </dt>

                      <dd className="break-words text-muted-foreground">
                        {product.warranty}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="p-4 text-sm text-muted-foreground sm:p-6">
                  No specifications listed
                  for this product.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="shipping">
            <div className="max-w-3xl space-y-4 rounded-xl border bg-card p-4 text-sm leading-relaxed text-muted-foreground sm:p-6">
              <div>
                <h4 className="mb-1 font-semibold text-foreground">
                  Shipping
                </h4>

                <p className="whitespace-pre-line">
                  {product.shippingInfo ||
                    'Orders are shipped by the merchant and paid for in cash on delivery. Delivery fees, if any, are calculated at delivery.'}
                </p>
              </div>

              <div>
                <h4 className="mb-1 font-semibold text-foreground">
                  Returns
                </h4>

                <p className="whitespace-pre-line">
                  {product.returnPolicy ||
                    'Return requests can be submitted from your order page after delivery. See our platform return policy for details.'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reviews">
            <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
              <div className="min-w-0 space-y-4 lg:col-span-3">
                {reviewsLoading ? (
                  <Spinner />
                ) : reviews?.length ? (
                  reviews.map(
                    (review) => (
                      <ReviewCard
                        key={review.id}
                        review={review}
                      />
                    ),
                  )
                ) : (
                  <EmptyState
                    title="No reviews yet"
                    description="Be the first to share your experience with this product."
                  />
                )}
              </div>

              <div className="min-w-0 lg:col-span-2">
                <ReviewForm
                  product={product}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="mt-16 space-y-14">
        <ProductShelf
          title="Related products"
          subtitle="More from this category"
          products={related}
          loading={relatedLoading}
          className="px-0 sm:px-0"
        />

        <RecentlyViewedShelf
          excludeId={product.id}
          className="px-0 sm:px-0"
        />
      </div>
    </div>
  )
}