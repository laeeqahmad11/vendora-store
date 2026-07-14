import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { notificationsService } from '@/services/notifications.service'
import { useAuthStore } from '@/stores/auth-store'
import { cn, timeAgo, getErrorMessage } from '@/lib/utils'
import type { AppNotification } from '@/types'

export default function NotificationsPage() {
  const { firebaseUser } = useAuthStore()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', firebaseUser?.uid],
    queryFn: () => notificationsService.list(firebaseUser!.uid),
    enabled: !!firebaseUser,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications', firebaseUser?.uid] })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: () => {
      const unread = (data ?? []).filter((n) => !n.read).map((n) => n.id)
      return notificationsService.markAllRead(unread)
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('All notifications marked as read')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const unreadCount = (data ?? []).filter((n) => !n.read).length

  const renderBody = (n: AppNotification) => (
    <>
      <div className={cn('mt-1 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', n.read ? 'font-normal text-muted-foreground' : 'font-semibold')}>{n.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
      </div>
    </>
  )

  return (
    <div>
      <SEO title="Notifications" />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">
          Notifications {unreadCount > 0 && <span className="text-sm font-medium text-primary">({unreadCount} new)</span>}
        </h2>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : isError ? (
        <EmptyState
          icon={Bell}
          title="Couldn't load notifications"
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : !data?.length ? (
        <EmptyState
          icon={BellOff}
          title="No notifications"
          description="Order updates and announcements will show up here."
        />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {data.map((n) =>
            n.linkUrl ? (
              <Link
                key={n.id}
                to={n.linkUrl}
                onClick={() => !n.read && markRead.mutate(n.id)}
                className={cn('flex gap-3 p-4 transition-colors hover:bg-accent', !n.read && 'bg-primary/5')}
              >
                {renderBody(n)}
              </Link>
            ) : (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.read && markRead.mutate(n.id)}
                className={cn('flex w-full gap-3 p-4 text-left transition-colors hover:bg-accent', !n.read && 'bg-primary/5')}
              >
                {renderBody(n)}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
