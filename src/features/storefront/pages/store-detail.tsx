import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { AtSign, BadgeCheck, Clock, Globe, Link2, PackageSearch, Share2, Store as StoreIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton, ProductCardSkeleton } from '@/components/ui/skeleton'
import { Avatar, EmptyState, RatingStars, Spinner } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { ProductCard } from '@/components/shared/product-card'
import { storesService } from '@/services/stores.service'
import { productsService } from '@/services/products.service'

export default function StoreDetailPage() {
  const { slug = '' } = useParams()

  const { data: store, isLoading, isError } = useQuery({
    queryKey: ['store', 'slug', slug],
    queryFn: () => storesService.getBySlug(slug),
    enabled: !!slug,
  })

  const products = useInfiniteQuery({
    queryKey: ['products', 'store', store?.id],
    queryFn: ({ pageParam }) => productsService.listPublic({ storeId: store!.id }, pageParam),
    initialPageParam: undefined as unknown,
    getNextPageParam: (last) => (last.hasMore ? last.cursor : undefined),
    enabled: !!store?.id,
  })

  const items = products.data?.pages.flatMap((p) => p.items) ?? []

  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = products
  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="mt-4 flex gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !store) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={StoreIcon}
          title="Store not found"
          description="This store may have been removed or the link is incorrect."
          action={
            <Button asChild>
              <Link to="/stores">Browse stores</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const socials = [
    { key: 'facebook', href: store.socialLinks?.facebook, icon: Share2, label: 'Facebook' },
    { key: 'instagram', href: store.socialLinks?.instagram, icon: AtSign, label: 'Instagram' },
    { key: 'twitter', href: store.socialLinks?.twitter, icon: Link2, label: 'Twitter' },
    { key: 'website', href: store.socialLinks?.website, icon: Globe, label: 'Website' },
  ].filter((s) => s.href)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title={store.name} description={store.seo?.description ?? store.description.slice(0, 160)} />

      {/* Banner */}
      <div className="h-40 overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 sm:h-56">
        {store.bannerUrl && <img src={store.bannerUrl} alt={`${store.name} banner`} className="size-full object-cover" />}
      </div>

      {/* Header */}
      <div className="mt-[-2.5rem] flex flex-col gap-4 px-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-4">
          <Avatar src={store.logoUrl} name={store.name} className="size-20 border-4 border-background bg-card shadow" />
          <div className="pb-1">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              {store.name}
              {store.verified && <BadgeCheck className="size-5 text-primary" aria-label="Verified store" />}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <RatingStars rating={store.rating} count={store.ratingCount} />
              <span>{store.productCount} products</span>
              <span>{store.totalSales} sales</span>
            </div>
          </div>
        </div>
        {socials.length > 0 && (
          <div className="flex gap-2 pb-1">
            {socials.map((s) => (
              <Button key={s.key} variant="outline" size="icon-sm" asChild aria-label={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer">
                  <s.icon />
                </a>
              </Button>
            ))}
          </div>
        )}
      </div>

      {store.description && (
        <p className="mt-5 max-w-3xl px-4 text-sm leading-relaxed text-muted-foreground">{store.description}</p>
      )}
      {store.businessHours && (
        <p className="mt-2 flex items-center gap-1.5 px-4 text-xs text-muted-foreground">
          <Clock className="size-3.5" /> {store.businessHours}
        </p>
      )}

      {/* Products */}
      <h2 className="mt-10 px-4 text-lg font-bold tracking-tight">Products</h2>
      <div className="mt-4 px-4">
        {products.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.isError ? (
          <EmptyState
            icon={PackageSearch}
            title="Couldn't load products"
            action={<Button onClick={() => products.refetch()}>Try again</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No products yet"
            description="This store hasn't listed any products yet — check back soon."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
        <div ref={sentinelRef} className="h-px" aria-hidden="true">
          {isFetchingNextPage && <Spinner className="py-8" />}
        </div>
      </div>
    </div>
  )
}
