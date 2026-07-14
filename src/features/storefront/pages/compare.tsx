import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Scale, ShoppingCart, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, RatingStars } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { PriceDisplay, effectivePrice } from '@/components/shared/price'
import { productsService } from '@/services/products.service'
import { useCartStore } from '@/stores/cart-store'

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const addItem = useCartStore((s) => s.addItem)
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4)

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'compare', ids],
    queryFn: () => productsService.getManyByIds(ids),
    enabled: ids.length > 0,
  })

  const products = ids.map((id) => data?.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p))

  const removeId = (id: string) => {
    const next = ids.filter((x) => x !== id)
    setParams(next.length ? { ids: next.join(',') } : {}, { replace: true })
  }

  if (!ids.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SEO title="Compare products" />
        <EmptyState
          icon={Scale}
          title="Nothing to compare"
          description="Open this page with product ids, e.g. /compare?ids=a,b,c — or browse the shop and come back."
          action={
            <Button asChild>
              <Link to="/shop">Browse products</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-6 h-96 w-full rounded-xl" />
      </div>
    )
  }

  const rows: { label: string; render: (p: (typeof products)[number]) => ReactNode }[] = [
    { label: 'Price', render: (p) => <PriceDisplay product={p} size="sm" /> },
    { label: 'Rating', render: (p) => <RatingStars rating={p.rating} count={p.ratingCount} /> },
    { label: 'Sold', render: (p) => <span className="text-sm">{p.soldCount}</span> },
    {
      label: 'Availability',
      render: (p) => (
        <span className={`text-sm font-medium ${p.stock > 0 ? 'text-success' : 'text-destructive'}`}>
          {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
        </span>
      ),
    },
    { label: 'Weight', render: (p) => <span className="text-sm text-muted-foreground">{p.weight ?? '—'}</span> },
    { label: 'Warranty', render: (p) => <span className="text-sm text-muted-foreground">{p.warranty ?? '—'}</span> },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title="Compare products" />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare products</h1>

      <div className="mt-6 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-36 p-4" />
              {products.map((p) => (
                <th key={p.id} className="p-4 align-top">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => removeId(p.id)}
                      aria-label={`Remove ${p.name} from comparison`}
                      className="absolute -right-1 -top-1 z-10 rounded-full bg-background p-1 shadow"
                    >
                      <X className="size-3" />
                    </button>
                    <Link to={`/products/${p.slug}`} className="block">
                      <div className="aspect-square w-full max-w-40 overflow-hidden rounded-lg border bg-muted">
                        {p.images[0] && <img src={p.images[0]} alt={p.name} className="size-full object-cover" />}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium">{p.name}</p>
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</td>
                {products.map((p) => (
                  <td key={p.id} className="p-4">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="p-4" />
              {products.map((p) => (
                <td key={p.id} className="p-4">
                  <Button
                    size="sm"
                    disabled={p.stock <= 0}
                    onClick={() => {
                      addItem({
                        productId: p.id,
                        storeId: p.storeId,
                        storeName: '',
                        name: p.name,
                        imageUrl: p.images[0],
                        price: effectivePrice(p).price,
                        quantity: p.minOrderQty ?? 1,
                        stock: p.stock,
                        maxOrderQty: p.maxOrderQty,
                      })
                      toast.success('Added to cart')
                    }}
                  >
                    <ShoppingCart /> Add
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
