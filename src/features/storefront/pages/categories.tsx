import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FolderTree, ShoppingBag } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { catalogService } from '@/services/catalog.service'

export default function CategoriesPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => catalogService.listCategories(),
  })

  const categories = data ?? []
  const top = categories.filter((c) => !c.parentId)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title="Categories" description="Browse all product categories." />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">All categories</h1>
      <p className="mt-1 text-sm text-muted-foreground">Find exactly what you're looking for.</p>

      {isError ? (
        <EmptyState
          icon={FolderTree}
          title="Couldn't load categories"
          description="Please check your connection and try again."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Categories will appear here once the catalog is set up."
          action={
            <Button asChild>
              <Link to="/shop">Browse all products</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((cat) => {
            const subs = categories.filter((s) => s.parentId === cat.id)
            return (
              <div key={cat.id} className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
                <Link to={`/shop?category=${cat.id}`} className="group block">
                  <div className="relative h-32 overflow-hidden bg-muted">
                    {cat.imageUrl ? (
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <ShoppingBag className="size-10 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
                      <h2 className="font-semibold text-white">{cat.name}</h2>
                    </div>
                  </div>
                </Link>
                <div className="p-4">
                  {cat.description && <p className="mb-2 text-xs text-muted-foreground">{cat.description}</p>}
                  {subs.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {subs.map((s) => (
                        <Link
                          key={s.id}
                          to={`/shop?category=${s.id}`}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link to={`/shop?category=${cat.id}`} className="text-xs font-medium text-primary hover:underline">
                      Shop {cat.name} →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
