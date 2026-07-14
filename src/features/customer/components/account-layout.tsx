import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  Bell,
  Heart,
  LifeBuoy,
  MapPin,
  Package,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar } from '@/components/ui/misc'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  {
    to: '/account',
    label: 'Profile',
    icon: User,
    end: true,
  },
  {
    to: '/account/orders',
    label: 'Orders',
    icon: Package,
  },
  {
    to: '/account/addresses',
    label: 'Addresses',
    icon: MapPin,
  },
  {
    to: '/account/wishlist',
    label: 'Wishlist',
    icon: Heart,
  },
  {
    to: '/account/reviews',
    label: 'My reviews',
    icon: Star,
  },
  {
    to: '/account/notifications',
    label: 'Notifications',
    icon: Bell,
  },
  {
    to: '/account/support',
    label: 'Support',
    icon: LifeBuoy,
  },
  {
    to: '/account/security',
    label: 'Security',
    icon: ShieldCheck,
  },
]

export default function AccountLayout() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const current =
    [...NAV_ITEMS]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) =>
        item.end
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to),
      )?.to ?? '/account'

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex min-w-0 items-center gap-3">
        <Avatar
          src={profile?.photoURL}
          name={profile?.displayName}
          className="size-11 shrink-0 sm:size-12"
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            My account
          </h1>

          <p className="truncate text-sm text-muted-foreground">
            {profile?.email}
          </p>
        </div>
      </div>

      <div className="mb-6 w-full min-w-0 lg:hidden">
        <Select
          value={current}
          onValueChange={(value) => navigate(value)}
        >
          <SelectTrigger
            className="w-full min-w-0"
            aria-label="Account section"
          >
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {NAV_ITEMS.map((item) => (
              <SelectItem
                key={item.to}
                value={item.to}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 gap-8">
        <aside
          className="hidden w-56 shrink-0 lg:block"
          aria-label="Account navigation"
        >
          <nav className="sticky top-24 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    isActive &&
                      'bg-accent text-primary',
                  )
                }
              >
                <item.icon className="size-4 shrink-0" />

                <span className="truncate">
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="w-full min-w-0 flex-1 overflow-x-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
}