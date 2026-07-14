import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Fuse from 'fuse.js'
import toast from 'react-hot-toast'
import { LayoutGrid, List, PackageSearch, ShoppingCart, SlidersHorizontal, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox, EmptyState, RatingStars, Slider, Spinner } from '@/components/ui/misc'
import { ProductCardSkeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ProductCard } from '@/components/shared/product-card'
import { PriceDisplay, effectivePrice } from '@/components/shared/price'
import { SEO } from '@/components/shared/seo'
import { productsService, type ProductFilters } from '@/services/products.service'
import { catalogService } from '@/services/catalog.service'
import { useCartStore } from '@/stores/cart-store'
import { SORT_OPTIONS, type SortOption } from '@/lib/constants'
import { cn, formatCurrency, truncate } from '@/lib/utils'
import type { Brand, Category, Product } from '@/types'

const PRICE_CAP = 1000

const SORT_VALUES = SORT_OPTIONS.map((o) => o.value) as string[]

function sortProducts(items: Product[], sort: SortOption): Product[] {
  const sorted = [...items]
  switch (sort) {
    case 'best_selling':
      return sorted.sort((a, b) => b.soldCount - a.soldCount)
    case 'popularity':
      return sorted.sort((a, b) => b.viewCount - a.viewCount)
    case 'price_asc':
      return sorted.sort((a, b) => effectivePrice(a).price - effectivePrice(b).price)
    case 'price_desc':
      return sorted.sort((a, b) => effectivePrice(b).price - effectivePrice(a).price)
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating)
    case 'alphabetical':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
  }
}

// -------------------------------------------------------- Filters panel

interface FiltersPanelProps {
  categories: Category[]
  brands: Brand[]
  category: string
  brand: string
  minPrice?: number
  maxPrice?: number
  rating?: number
  inStock: boolean
  onSale: boolean
  setParam: (key: string, value?: string) => void
}

function FiltersPanel(props: FiltersPanelProps) {
  const { categories, brands, category, brand, minPrice, maxPrice, rating, inStock, onSale, setParam } = props
  const [range, setRange] = React.useState<[number, number]>([minPrice ?? 0, maxPrice ?? PRICE_CAP])

  React.useEffect(() => {
    setRange([minPrice ?? 0, maxPrice ?? PRICE_CAP])
  }, [minPrice, maxPrice])

  const topCategories = categories.filter((c) => !c.parentId)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Category</h3>
        <div className="space-y-1">
          {topCategories.length === 0 && <p className="text-xs text-muted-foreground">No categories yet.</p>}
          {topCategories.map((c) => {
            const subs = categories.filter((s) => s.parentId === c.id)
            return (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => setParam('category', category === c.id ? undefined : c.id)}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                    category === c.id && 'bg-accent font-medium text-primary',
                  )}
                >
                  {c.name}
                </button>
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setParam('category', category === s.id ? undefined : s.id)}
                    className={cn(
                      'ml-3 block w-[calc(100%-0.75rem)] rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                      category === s.id && 'bg-accent font-medium text-primary',
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {brands.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Brand</h3>
          <div className="space-y-1">
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setParam('brand', brand === b.id ? undefined : b.id)}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                  brand === b.id && 'bg-accent font-medium text-primary',
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold">Price range</h3>
        <Slider
          min={0}
          max={PRICE_CAP}
          step={5}
          value={range}
          onValueChange={(v) => setRange([v[0] ?? 0, v[1] ?? PRICE_CAP])}
          onValueCommit={(v) => {
            setParam('minPrice', v[0] ? String(v[0]) : undefined)
            setParam('maxPrice', v[1] !== undefined && v[1] < PRICE_CAP ? String(v[1]) : undefined)
          }}
          aria-label="Price range"
        />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(range[0])}</span>
          <span>{range[1] >= PRICE_CAP ? `${formatCurrency(PRICE_CAP)}+` : formatCurrency(range[1])}</span>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Minimum rating</h3>
        <div className="space-y-1">
          {[4, 3, 2, 1].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setParam('rating', rating === r ? undefined : String(r))}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                rating === r && 'bg-accent font-medium',
              )}
            >
              <span className="flex">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={cn('size-3.5', s <= r ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted')} />
                ))}
              </span>
              &amp; up
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold">Availability</h3>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={inStock} onCheckedChange={(c) => setParam('stock', c ? 'in' : undefined)} />
          In stock only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={onSale} onCheckedChange={(c) => setParam('filter', c ? 'sale' : undefined)} />
          On sale
        </label>
      </div>
    </div>
  )
}

// ----------------------------------------------------------- List row

function ProductListRow({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem)
  const { price } = effectivePrice(product)
  const outOfStock = product.stock <= 0
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4">
      <Link to={`/products/${product.slug}`} className="block size-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-32">
        {product.images[0] ? (
          <img src={product.images[0]} alt={product.name} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ShoppingCart className="size-8 opacity-30" />
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/products/${product.slug}`} className="font-medium leading-snug hover:text-primary">
          {product.name}
        </Link>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{truncate(product.description, 140)}</p>
        <div className="mt-1">
          <RatingStars rating={product.rating} count={product.ratingCount} />
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <PriceDisplay product={product} />
          <Button
            size="sm"
            disabled={outOfStock}
            onClick={() => {
              addItem({
                productId: product.id,
                storeId: product.storeId,
                storeName: '',
                name: product.name,
                imageUrl: product.images[0],
                price,
                quantity: product.minOrderQty ?? 1,
                stock: product.stock,
                maxOrderQty: product.maxOrderQty,
              })
              toast.success('Added to cart')
            }}
          >
            <ShoppingCart /> {outOfStock ? 'Out of stock' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- Page

export default function ProductListingPage() {
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const brand = params.get('brand') ?? ''
  const sortParam = params.get('sort') ?? ''
  const sort: SortOption = SORT_VALUES.includes(sortParam) ? (sortParam as SortOption) : 'newest'
  const onSale = params.get('filter') === 'sale'
  const minPrice = params.get('minPrice') ? Number(params.get('minPrice')) : undefined
  const maxPrice = params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined
  const rating = params.get('rating') ? Number(params.get('rating')) : undefined
  const inStock = params.get('stock') === 'in'

  const [view, setView] = React.useState<'grid' | 'list'>('grid')

  const setParam = React.useCallback(
    (key: string, value?: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const catalog = useQuery({ queryKey: ['categories', 'all'], queryFn: () => catalogService.listCategories() })
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: () => catalogService.listBrands() })
  const categories = catalog.data ?? []
  const brands = brandsQuery.data ?? []

  const filters: ProductFilters = React.useMemo(
    () => ({
      categoryId: category || undefined,
      brandId: brand || undefined,
      minPrice,
      maxPrice,
      minRating: rating,
      inStockOnly: inStock || undefined,
      onSaleOnly: onSale || undefined,
      sort,
    }),
    [category, brand, minPrice, maxPrice, rating, inStock, onSale, sort],
  )

  // ------------------------------------------------ browse (infinite)
  const browse = useInfiniteQuery({
    queryKey: ['products', 'browse', filters],
    queryFn: ({ pageParam }) => productsService.listPublic(filters, pageParam),
    initialPageParam: undefined as unknown,
    getNextPageParam: (last) => (last.hasMore ? last.cursor : undefined),
    enabled: !q,
  })

  // -------------------------------------------------- search (Fuse.js)
  const searchIndex = useQuery({
    queryKey: ['products', 'search-index'],
    queryFn: () => productsService.listForSearch(),
    enabled: !!q,
    staleTime: 5 * 60_000,
  })

  const searchResults = React.useMemo(() => {
    if (!q || !searchIndex.data) return []
    const fuse = new Fuse(searchIndex.data, {
      keys: ['name', 'description', 'tags'],
      threshold: 0.35,
      ignoreLocation: true,
    })
    let items = fuse.search(q).map((r) => r.item)
    if (category) items = items.filter((p) => p.categoryId === category || p.subcategoryId === category)
    if (brand) items = items.filter((p) => p.brandId === brand)
    if (minPrice != null) items = items.filter((p) => effectivePrice(p).price >= minPrice)
    if (maxPrice != null) items = items.filter((p) => effectivePrice(p).price <= maxPrice)
    if (rating != null) items = items.filter((p) => p.rating >= rating)
    if (inStock) items = items.filter((p) => p.stock > 0)
    if (onSale) items = items.filter((p) => (p.compareAtPrice ?? 0) > p.price || p.flashSale?.active)
    return sortParam ? sortProducts(items, sort) : items
  }, [q, searchIndex.data, category, brand, minPrice, maxPrice, rating, inStock, onSale, sort, sortParam])

  const products: Product[] = q ? searchResults : (browse.data?.pages.flatMap((p) => p.items) ?? [])
  const isLoading = q ? searchIndex.isLoading : browse.isLoading
  const isError = q ? searchIndex.isError : browse.isError

  // ------------------------------------------- infinite scroll sentinel
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = browse
  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el || q || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [q, hasNextPage, isFetchingNextPage, fetchNextPage, products.length])

  // ------------------------------------------------------ active chips
  const chips: { label: string; onClear: () => void }[] = []
  if (q) chips.push({ label: `"${q}"`, onClear: () => setParam('q') })
  if (category) {
    const cat = categories.find((c) => c.id === category)
    chips.push({ label: cat?.name ?? 'Category', onClear: () => setParam('category') })
  }
  if (brand) {
    const b = brands.find((x) => x.id === brand)
    chips.push({ label: b?.name ?? 'Brand', onClear: () => setParam('brand') })
  }
  if (minPrice != null || maxPrice != null) {
    chips.push({
      label: `${formatCurrency(minPrice ?? 0)} – ${maxPrice != null ? formatCurrency(maxPrice) : `${formatCurrency(PRICE_CAP)}+`}`,
      onClear: () => {
        setParam('minPrice')
        setParam('maxPrice')
      },
    })
  }
  if (rating != null) chips.push({ label: `${rating}★ & up`, onClear: () => setParam('rating') })
  if (inStock) chips.push({ label: 'In stock', onClear: () => setParam('stock') })
  if (onSale) chips.push({ label: 'On sale', onClear: () => setParam('filter') })

  const clearAll = () => setParams(new URLSearchParams(), { replace: true })

  const filtersPanelProps: FiltersPanelProps = {
    categories,
    brands,
    category,
    brand,
    minPrice,
    maxPrice,
    rating,
    inStock,
    onSale,
    setParam,
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title={q ? `Search: ${q}` : 'Shop'} description="Browse all products from verified merchants." />

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{q ? `Results for "${q}"` : 'Shop'}</h1>
        {!isLoading && (
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length}
            {!q && hasNextPage ? '+' : ''} product{products.length === 1 ? '' : 's'} found
          </p>
        )}
      </div>

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block" aria-label="Product filters">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            <FiltersPanel {...filtersPanelProps} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <SlidersHorizontal /> Filters
                  {chips.length > 0 && <Badge className="ml-1">{chips.length}</Badge>}
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetTitle>Filters</SheetTitle>
                <div className="mt-4">
                  <FiltersPanel {...filtersPanelProps} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="ml-auto flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setParam('sort', v)}>
                <SelectTrigger className="h-9 w-44" aria-label="Sort products">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border p-0.5">
                <Button
                  variant={view === 'grid' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                >
                  <LayoutGrid />
                </Button>
                <Button
                  variant={view === 'list' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setView('list')}
                  aria-label="List view"
                >
                  <List />
                </Button>
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.onClear}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {chip.label} <X className="size-3" />
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            </div>
          )}

          {/* Results */}
          {isError ? (
            <EmptyState
              icon={PackageSearch}
              title="Something went wrong"
              description="We couldn't load products right now. Please try again."
              action={
                <Button onClick={() => (q ? searchIndex.refetch() : browse.refetch())}>Try again</Button>
              }
            />
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="No products found"
              description={
                q
                  ? `Nothing matches "${q}". Try a different search term or remove some filters.`
                  : 'No products match your filters yet. Try widening your criteria.'
              }
              action={<Button onClick={clearAll}>Clear filters</Button>}
            />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((p) => (
                <ProductListRow key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {!q && (
            <div ref={sentinelRef} className="h-px" aria-hidden="true">
              {isFetchingNextPage && <Spinner className="py-8" />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
