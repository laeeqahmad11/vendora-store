import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Newspaper } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { cmsService } from '@/services/cms.service'
import { formatDate } from '@/lib/utils'

export default function BlogListPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['blogs'],
    queryFn: () => cmsService.listBlogs(true),
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title="Blog" description="News, guides and stories from the marketplace." />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Blog</h1>
      <p className="mt-1 text-sm text-muted-foreground">News, guides and stories from our community.</p>

      {isError ? (
        <EmptyState
          icon={Newspaper}
          title="Couldn't load posts"
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : isLoading ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-video rounded-xl" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Newspaper}
          title="No posts yet"
          description="We're working on our first stories — check back soon."
        />
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="aspect-video overflow-hidden bg-muted">
                {post.coverUrl ? (
                  <img
                    src={post.coverUrl}
                    alt={post.title}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Newspaper className="size-10 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground">
                  {formatDate(post.createdAt)} · {post.author}
                </p>
                <h2 className="mt-1.5 line-clamp-2 font-semibold leading-snug group-hover:text-primary">
                  {post.title}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
                {post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
