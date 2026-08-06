import * as React from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()

  const uid = useAuthStore(
    (state) => state.firebaseUser?.uid,
  )

  const [items, setItems] = React.useState<
    AppNotification[]
  >([])

  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!uid) {
      setItems([])
      return
    }

    return notificationsService.subscribe(
      uid,
      setItems,
    )
  }, [uid])

  const unread = React.useMemo(
    () =>
      items.filter(
        (notification) => !notification.read,
      ),
    [items],
  )

  const handleNotificationClick = React.useCallback(
    (notification: AppNotification) => {
      /*
       * Close the dropdown immediately so it does not
       * interfere with React Router navigation.
       */
      setOpen(false)

      /*
       * Marking the notification as read is non-blocking.
       * Navigation should still work if this request fails.
       */
      if (!notification.read) {
        void notificationsService.markRead(
          notification.id,
        )
      }

      if (
        notification.linkUrl &&
        notification.linkUrl !== '#'
      ) {
        navigate(notification.linkUrl)
      }
    },
    [navigate],
  )

  const handleMarkAllRead =
    React.useCallback(() => {
      if (!unread.length) return

      void notificationsService.markAllRead(
        unread.map(
          (notification) => notification.id,
        ),
      )
    }, [unread])

  if (!uid) return null

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="size-4.5" />

          {unread.length > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unread.length > 9
                ? '9+'
                : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0">
            Notifications
          </DropdownMenuLabel>

          {unread.length > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          )}

          {items.map((notification) => {
            const isClickable = Boolean(
              notification.linkUrl &&
                notification.linkUrl !== '#',
            )

            return (
              <button
                key={notification.id}
                type="button"
                disabled={!isClickable}
                onClick={() =>
                  handleNotificationClick(
                    notification,
                  )
                }
                className={[
                  'block w-full border-b px-3 py-2.5 text-left text-sm transition-colors last:border-0',
                  isClickable
                    ? 'cursor-pointer hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'
                    : 'cursor-default',
                ].join(' ')}
              >
                <div className="flex items-start gap-2">
                  {!notification.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      {notification.title}
                    </p>

                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {notification.body}
                    </p>

                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {timeAgo(
                        notification.createdAt,
                      )}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}