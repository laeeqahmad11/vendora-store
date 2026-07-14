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
  MessageCircle,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Avatar,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/layouts/dashboard-layout'
import { reviewsService } from '@/services/reviews.service'
import { productsService } from '@/services/products.service'
import {
  formatDate,
  getErrorMessage,
} from '@/lib/utils'
import type { Review } from '@/types'
import {
  ErrorState,
  useMerchant,
} from '../components/common'

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
  approved: {
    label: 'Approved',
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

export default function ReviewsPage() {
  const { store } = useMerchant()
  const queryClient = useQueryClient()

  const [tab, setTab] =
    React.useState<ReviewTab>('all')
  const [replying, setReplying] =
    React.useState<Review | null>(null)
  const [replyText, setReplyText] =
    React.useState('')

  const reviewsQ = useQuery({
    queryKey: ['merchant-reviews', store.id],
    queryFn: () =>
      reviewsService.listForStore(store.id),
  })

  const productsQ = useQuery({
    queryKey: ['merchant-products', store.id],
    queryFn: () =>
      productsService.listByStore(store.id),
  })

  const productNames = React.useMemo(() => {
    const map = new Map<string, string>()

    for (const product of productsQ.data ?? []) {
      map.set(product.id, product.name)
    }

    return map
  }, [productsQ.data])

  const reviews = reviewsQ.data ?? []

  const reportedCount = reviews.filter(
    (review) => review.reported,
  ).length

  const visible = reviews.filter((review) => {
    if (tab === 'all') return true

    if (tab === 'reported') {
      return !!review.reported
    }

    return review.status === tab
  })

  const statusMutation = useMutation({
    mutationFn: ({
      review,
      status,
    }: {
      review: Review
      status: Review['status']
    }) =>
      reviewsService.setStatus(
        review,
        status,
      ),

    onSuccess: async () => {
      toast.success('Review updated')

      await queryClient.invalidateQueries({
        queryKey: [
          'merchant-reviews',
          store.id,
        ],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!replying) return

      if (!replyText.trim()) {
        throw new Error(
          'Reply cannot be empty.',
        )
      }

      await reviewsService.reply(
        replying.id,
        replyText.trim(),
      )
    },

    onSuccess: async () => {
      toast.success('Reply posted')
      setReplying(null)
      setReplyText('')

      await queryClient.invalidateQueries({
        queryKey: [
          'merchant-reviews',
          store.id,
        ],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  if (reviewsQ.isError) {
    return (
      <ErrorState
        onRetry={() =>
          void reviewsQ.refetch()
        }
      />
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Reviews"
        description="Moderate and respond to customer reviews."
      />

      <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value as ReviewTab)
          }
          className="w-max min-w-full"
        >
          <TabsList className="inline-flex h-auto min-w-max">
            <TabsTrigger
              value="all"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              All ({reviews.length})
            </TabsTrigger>

            <TabsTrigger
              value="approved"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Approved
            </TabsTrigger>

            <TabsTrigger
              value="pending"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Pending
            </TabsTrigger>

            <TabsTrigger
              value="hidden"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Hidden
            </TabsTrigger>

            <TabsTrigger
              value="rejected"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Rejected
            </TabsTrigger>

            <TabsTrigger
              value="reported"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Reported ({reportedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {reviewsQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-40 w-full rounded-xl"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Star}
          title={
            tab === 'all'
              ? 'No reviews yet'
              : 'Nothing here'
          }
          description={
            tab === 'all'
              ? 'Reviews from your customers will appear here.'
              : 'No reviews match this filter.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((review) => {
            const badge =
              STATUS_BADGES[review.status]

            return (
              <div
                key={review.id}
                className="min-w-0 rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="shrink-0">
                    <Avatar
                      name={review.customerName}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className="max-w-[220px] truncate font-semibold"
                            title={
                              review.customerName
                            }
                          >
                            {review.customerName}
                          </p>

                          {review.orderId && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                              <ShieldCheck className="size-3.5 shrink-0" />
                              Verified purchase
                            </span>
                          )}

                          <Badge
                            variant={
                              badge.variant
                            }
                          >
                            {badge.label}
                          </Badge>

                          {review.reported && (
                            <Badge variant="destructive">
                              <Flag className="size-3" />
                              Reported
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <RatingStars
                            rating={review.rating}
                          />

                          <span className="text-xs text-muted-foreground">
                            on{' '}
                            {productNames.get(
                              review.productId,
                            ) ??
                              'Deleted product'}
                          </span>
                        </div>
                      </div>

                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(
                          review.createdAt,
                        )}
                      </span>
                    </div>

                    {review.title && (
                      <p className="mt-3 break-words text-sm font-semibold">
                        {review.title}
                      </p>
                    )}

                    <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                      {review.comment}
                    </p>

                    {review.images &&
                      review.images.length > 0 && (
                        <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
                          {review.images.map(
                            (url) => (
                              <img
                                key={url}
                                src={url}
                                alt=""
                                className="size-16 shrink-0 rounded-lg border object-cover sm:size-20"
                              />
                            ),
                          )}
                        </div>
                      )}

                    {review.reply && (
                      <div className="mt-4 rounded-xl border bg-muted/40 p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Your reply
                          </p>

                          <span className="text-xs text-muted-foreground">
                            {formatDate(
                              review.reply.at,
                            )}
                          </span>
                        </div>

                        <p className="mt-1 break-words text-sm leading-6">
                          {review.reply.text}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {review.status !==
                        'approved' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={
                            statusMutation.isPending
                          }
                          onClick={() =>
                            statusMutation.mutate({
                              review,
                              status:
                                'approved',
                            })
                          }
                        >
                          <Check className="size-4" />
                          Approve
                        </Button>
                      )}

                      {review.status !==
                        'hidden' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={
                            statusMutation.isPending
                          }
                          onClick={() =>
                            statusMutation.mutate({
                              review,
                              status: 'hidden',
                            })
                          }
                        >
                          <EyeOff className="size-4" />
                          Hide
                        </Button>
                      )}

                      {review.status !==
                        'rejected' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-destructive hover:text-destructive sm:w-auto"
                          disabled={
                            statusMutation.isPending
                          }
                          onClick={() =>
                            statusMutation.mutate({
                              review,
                              status:
                                'rejected',
                            })
                          }
                        >
                          <X className="size-4" />
                          Reject
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setReplying(review)
                          setReplyText(
                            review.reply?.text ??
                              '',
                          )
                        }}
                      >
                        <MessageCircle className="size-4" />
                        {review.reply
                          ? 'Edit reply'
                          : 'Reply'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!replying}
        onOpenChange={(open) => {
          if (!open) {
            setReplying(null)
            setReplyText('')
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="break-words">
              Reply to {replying?.customerName}
            </DialogTitle>

            <DialogDescription>
              Your reply is public and shown under
              the review.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={5}
            placeholder="Thanks for your feedback…"
            value={replyText}
            onChange={(event) =>
              setReplyText(event.target.value)
            }
            className="min-h-32 resize-y"
          />

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setReplying(null)
                setReplyText('')
              }}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="w-full sm:w-auto"
              loading={replyMutation.isPending}
              onClick={() =>
                replyMutation.mutate()
              }
            >
              Post reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}