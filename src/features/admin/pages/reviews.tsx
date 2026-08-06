import * as React from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Check,
  EyeOff,
  Flag,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  EmptyState,
  RatingStars,
} from '@/components/ui/misc'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/layouts/dashboard-layout'
import { reviewsService } from '@/services/reviews.service'
import { productsService } from '@/services/products.service'
import {
  formatDate,
  getErrorMessage,
} from '@/lib/utils'
import type { Review } from '@/types'

type ReviewTab =
  | 'all'
  | Review['status']
  | 'reported'

const STATUS_BADGES: Record<
  Review['status'],
  {
    label: string
    variant:
      | 'success'
      | 'warning'
      | 'destructive'
      | 'secondary'
  }
> = {
  approved: { label: 'Approved', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  hidden: { label: 'Hidden', variant: 'secondary' },
}

export default function AdminReviewsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<ReviewTab>('all')
  const [search, setSearch] = React.useState('')

  const reviewsQ = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: () => reviewsService.listAll(),
  })

  const productIds = React.useMemo(
    () => [
      ...new Set(
        (reviewsQ.data ?? []).map((review) => review.productId),
      ),
    ],
    [reviewsQ.data],
  )

  const productsQ = useQuery({
    queryKey: ['admin-review-products', productIds],
    queryFn: () => productsService.getManyByIds(productIds),
    enabled: productIds.length > 0,
  })

  const productNames = React.useMemo(() => {
    const map = new Map<string, string>()

    for (const product of productsQ.data ?? []) {
      map.set(product.id, product.name)
    }

    return map
  }, [productsQ.data])

  const reviews = reviewsQ.data ?? []

  const counts = React.useMemo(
    () => ({
      total: reviews.length,
      approved: reviews.filter((review) => review.status === 'approved').length,
      pending: reviews.filter((review) => review.status === 'pending').length,
      hidden: reviews.filter((review) => review.status === 'hidden').length,
      reported: reviews.filter((review) => review.reported).length,
    }),
    [reviews],
  )

  const visible = React.useMemo(() => {
    const normalized = search.trim().toLowerCase()

    return reviews.filter((review) => {
      const matchesTab =
        tab === 'all'
          ? true
          : tab === 'reported'
            ? Boolean(review.reported)
            : review.status === tab

      if (!matchesTab) return false
      if (!normalized) return true

      const productName = productNames.get(review.productId) ?? ''

      return [
        review.customerName,
        review.title ?? '',
        review.comment,
        productName,
        review.storeId,
      ].some((value) => value.toLowerCase().includes(normalized))
    })
  }, [reviews, tab, search, productNames])

  const statusMutation = useMutation({
    mutationFn: ({ review, status }: { review: Review; status: Review['status'] }) =>
      reviewsService.setStatus(review, status),
    onSuccess: async () => {
      toast.success('Review updated')
      await queryClient.invalidateQueries({ queryKey: ['admin-reviews'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (review: Review) => reviewsService.remove(review),
    onSuccess: async () => {
      toast.success('Review deleted')
      await queryClient.invalidateQueries({ queryKey: ['admin-reviews'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteReview = (review: Review) => {
    if (!window.confirm('Delete this review permanently?')) return
    deleteMutation.mutate(review)
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Reviews"
        description="Moderate customer reviews across the platform."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total reviews" value={counts.total} />
        <StatCard label="Approved" value={counts.approved} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Hidden" value={counts.hidden} />
        <StatCard label="Reported" value={counts.reported} />
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as ReviewTab)}
            className="w-max min-w-full"
          >
            <TabsList className="inline-flex h-auto min-w-max">
              <TabsTrigger value="all">All ({counts.total})</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="hidden">Hidden</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="reported">Reported ({counts.reported})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reviews..."
            className="pl-9"
          />
        </div>
      </div>

      {reviewsQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : reviewsQ.isError ? (
        <EmptyState
          icon={Star}
          title="Could not load reviews"
          description="Please refresh the page and try again."
          action={
            <Button type="button" variant="outline" onClick={() => void reviewsQ.refetch()}>
              Try again
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No matching reviews"
          description="No reviews match the current filter."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((review) => {
            const badge = STATUS_BADGES[review.status]

            return (
              <Card key={review.id} className="min-w-0 overflow-hidden">
                <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{review.customerName}</CardTitle>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {review.reported && (
                          <Badge variant="destructive">
                            <Flag className="size-3" />
                            Reported
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <RatingStars rating={review.rating} />
                        <span className="text-xs text-muted-foreground">
                          {productNames.get(review.productId) ?? 'Deleted product'}
                        </span>
                      </div>
                    </div>

                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                  {review.title && (
                    <p className="break-words text-sm font-semibold">{review.title}</p>
                  )}

                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                    {review.comment}
                  </p>

                  {review.reply && (
                    <div className="mt-4 rounded-xl border bg-muted/40 p-3">
                      <p className="text-xs font-semibold text-muted-foreground">Merchant reply</p>
                      <p className="mt-1 break-words text-sm leading-6">{review.reply.text}</p>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {review.status !== 'approved' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ review, status: 'approved' })}
                      >
                        <Check className="size-4" />
                        Approve
                      </Button>
                    )}

                    {review.status !== 'hidden' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ review, status: 'hidden' })}
                      >
                        <EyeOff className="size-4" />
                        Hide
                      </Button>
                    )}

                    {review.status !== 'rejected' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ review, status: 'rejected' })}
                      >
                        <X className="size-4" />
                        Reject
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteReview(review)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}