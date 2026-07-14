import * as React from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { notificationsService } from '@/services/notifications.service'
import { timeAgo } from '@/lib/utils'
import type { AppNotification } from '@/types'

/** Real-time notification dropdown shared by all three role shells */
export function NotificationsBell() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid)
  const [items, setItems] = React.useState<AppNotification[]>([])

  React.useEffect(() => {
    if (!uid) return
    return notificationsService.subscribe(uid, setItems)
  }, [uid])

  const unread = items.filter((n) => !n.read)
  if (!uid) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4.5" />
          {unread.length > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread.length > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => notificationsService.markAllRead(unread.map((n) => n.id))}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet</p>
          )}
          {items.map((n) => (
            <Link
              key={n.id}
              to={n.linkUrl ?? '#'}
              onClick={() => !n.read && notificationsService.markRead(n.id)}
              className="block border-b px-3 py-2.5 text-sm transition-colors last:border-0 hover:bg-accent"
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
