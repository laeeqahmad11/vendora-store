import * as React from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { LogOut, Menu, ShoppingBag, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Avatar } from '@/components/ui/misc'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { NotificationsBell } from '@/components/shared/notifications-bell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth-store'
import { authService } from '@/services/auth.service'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/utils'

export interface DashboardNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

interface DashboardLayoutProps {
  title: string
  nav: DashboardNavItem[]
  children?: React.ReactNode
}

function SidebarNav({ nav }: { nav: DashboardNavItem[] }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
            )
          }
        >
          <item.icon className="size-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Shared SaaS-style dashboard shell for the merchant and admin areas */
export function DashboardLayout({ title, nav, children }: DashboardLayoutProps) {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const brand = (
    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShoppingBag className="size-4.5" />
      </span>
      <span>
        {APP_NAME}
        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
          {title}
        </span>
      </span>
    </Link>
  )

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-4">{brand}</div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav nav={nav} />
        </div>
        <div className="border-t p-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ShoppingBag className="size-4" /> View storefront
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-40 flex h-16 items-center gap-3 border-b px-4 sm:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="mb-6">{brand}</div>
              <SidebarNav nav={nav} />
            </SheetContent>
          </Sheet>

          <div className="lg:hidden">{brand}</div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar src={profile?.photoURL} name={profile?.displayName} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{profile?.displayName}</p>
                  <p className="text-xs font-normal text-muted-foreground">{profile?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await authService.logout()
                    toast.success('Signed out')
                    navigate('/')
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
