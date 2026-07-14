import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState, RatingStars } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { reviewsService } from '@/services/reviews.service'
import { productsService } from '@/services/products.service'
import { useAuthStore } from '@/stores/auth-store'
import { formatDate } from '@/lib/utils'
import type { Review } from '@/types'

const STATUS_BADGE: Record<
  Review['status'],
  {
    label: string
    variant: 'success' | 'warning' | 'destructive' | 'secondary'
  }
> = {
  approved: {
    label: 'Published',
    variant: 'success',
  },
  pending: {
    label: 'Pending',
    variant: 'warning',
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive',
  },
  hidden: {
    label: 'Hidden',
    variant: 'secondary',
  },
}

export default function MyReviewsPage() {
  const { firebaseUser } = useAuthStore()

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['reviews', 'mine', firebaseUser?.uid],
    queryFn: () =>
      reviewsService.listByCustomer(firebaseUser!.uid),
    enabled: Boolean(firebaseUser),
  })

  const productIds = [
    ...new Set(
      (data ?? []).map((review) => review.productId),
    ),
  ]

  const { data: products } = useQuery({
    queryKey: ['products', 'for-reviews', productIds],
    queryFn: () =>
      productsService.getManyByIds(productIds),
    enabled: productIds.length > 0,
  })

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <SEO title="My reviews" />

      <h2 className="mb-4 break-words text-lg font-bold tracking-tight">
        My reviews
      </h2>

      {isLoading ? (
        <div className="w-full min-w-0 overflow-hidden">
          <TableSkeleton rows={4} />
        </div>
      ) : isError ? (
        <div className="w-full min-w-0 overflow-hidden">
          <EmptyState
            icon={Star}
            title="Couldn't load reviews"
            action={
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => void refetch()}
              >
                Try again
              </Button>
            }
          />
        </div>
      ) : !data?.length ? (
        <div className="w-full min-w-0 overflow-hidden">
          <EmptyState
            icon={Star}
            title="No reviews yet"
            description="Reviews you write on products will appear here."
            action={
              <Button
                asChild
                className="w-full sm:w-auto"
              >
                <Link to="/account/orders">
                  Review a past order
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
          {data.map((review) => {
            const product = products?.find(
              (item) => item.id === review.productId,
            )

            const badge = STATUS_BADGE[review.status]
            const productImage = product?.images[0]

            return (
              <Card
                key={review.id}
                className="w-full min-w-0 max-w-full overflow-hidden p-4 sm:p-5"
              >
                <div className="w-full min-w-0">
                  <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      {productImage ? (
                        <img
                          src={productImage}
                          alt={product?.name ?? 'Product'}
                          loading="lazy"
                          className="size-12 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                          <Star className="size-5 opacity-30" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        {product ? (
                          <Link
                            to={`/products/${product.slug}`}
                            title={product.name}
                            className="block max-w-full truncate text-sm font-semibold hover:text-primary"
                          >
                            {product.name}
                          </Link>
                        ) : (
                          <p className="max-w-full truncate text-sm font-semibold text-muted-foreground">
                            Product unavailable
                          </p>
                        )}

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(review.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex max-w-full flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                      <div className="max-w-full shrink-0 overflow-hidden">
                        <RatingStars rating={review.rating} />
                      </div>

                      <Badge
                        variant={badge.variant}
                        className="max-w-full shrink-0"
                      >
                        {badge.label}
                      </Badge>
                    </div>
                  </div>

                  {review.title && (
                    <h3 className="mt-3 max-w-full break-words text-sm font-semibold">
                      {review.title}
                    </h3>
                  )}

                  <p className="mt-1 max-w-full break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                    {review.comment}
                  </p>

                  {review.reply && (
                    <div className="mt-3 w-full min-w-0 max-w-full overflow-hidden rounded-lg bg-muted/60 p-3">
                      <p className="break-words text-xs font-semibold">
                        Seller response
                      </p>

                      <p className="mt-0.5 max-w-full break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                        {review.reply.text}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}