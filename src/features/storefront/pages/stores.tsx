import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Store as StoreIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Avatar, EmptyState, RatingStars } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { storesService } from '@/services/stores.service'
import { truncate } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'

export default function StoresPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stores', 'approved'],
    queryFn: () => storesService.listApproved(60),
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title="Stores" description={`Browse all verified merchant stores on ${APP_NAME}.`} />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Our stores</h1>
      <p className="mt-1 text-sm text-muted-foreground">Independent brands, verified by our team.</p>

      {isError ? (
        <EmptyState
          icon={StoreIcon}
          title="Couldn't load stores"
          description="Please check your connection and try again."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores yet"
          description={`Be the first to open a store on ${APP_NAME}!`}
          action={
            <Button asChild>
              <Link to="/merchant">Open a store</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((store) => (
            <Link
              key={store.id}
              to={`/stores/${store.slug}`}
              className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="h-24 bg-gradient-to-r from-primary/15 to-primary/5">
                {store.bannerUrl && (
                  <img src={store.bannerUrl} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </div>
              <div className="p-5 pt-0">
                <Avatar
                  src={store.logoUrl}
                  name={store.name}
                  className="-mt-7 size-14 border-4 border-card bg-card"
                />
                <h2 className="mt-2 flex items-center gap-1.5 font-semibold group-hover:text-primary">
                  {store.name}
                  {store.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified store" />}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{truncate(store.description, 90)}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <RatingStars rating={store.rating} count={store.ratingCount} />
                  <span>{store.productCount} products</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
