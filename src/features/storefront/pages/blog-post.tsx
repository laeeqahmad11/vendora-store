import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { cmsService } from '@/services/cms.service'
import { formatDate } from '@/lib/utils'

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['blog', slug],
    queryFn: () => cmsService.getBlogBySlug(slug),
    enabled: !!slug,
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-3 h-4 w-40" />
        <Skeleton className="mt-6 aspect-video rounded-2xl" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={Newspaper}
          title="Post not found"
          description="This post may have been removed or unpublished."
          action={
            <Button asChild>
              <Link to="/blog">Back to blog</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <SEO title={post.title} description={post.excerpt} />

      <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All posts
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{post.title}</h1>

      <div className="mt-4 flex items-center gap-3">
        <Avatar name={post.author} />
        <div>
          <p className="text-sm font-medium">{post.author}</p>
          <p className="text-xs text-muted-foreground">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {post.coverUrl && (
        <img src={post.coverUrl} alt={post.title} className="mt-6 aspect-video w-full rounded-2xl border object-cover" />
      )}

      <div className="mt-8 whitespace-pre-line text-base leading-relaxed text-foreground/90">{post.content}</div>

      {post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2 border-t pt-6">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}
