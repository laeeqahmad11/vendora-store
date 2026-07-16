import * as React from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  User,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Avatar } from '@/components/ui/misc'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { NotificationsBell } from '@/components/shared/notifications-bell'
import { useAuthStore } from '@/stores/auth-store'
import {
  getCount,
  selectItems,
  useCartStore,
} from '@/stores/cart-store'
import { authService } from '@/services/auth.service'
import { cmsService } from '@/services/cms.service'
import { APP_NAME } from '@/lib/constants'
import { isFirebaseConfigured } from '@/lib/firebase'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/shop', label: 'Shop' },
  { to: '/categories', label: 'Categories' },
  { to: '/stores', label: 'Stores' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
]

function Logo({
  mobile = false,
}: {
  mobile?: boolean
}) {
  return (
    <Link
      to="/"
      aria-label={`${APP_NAME} home`}
      className="flex min-w-0 items-center gap-2 font-bold tracking-tight"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:size-9">
        <ShoppingBag className="size-[18px]" />
      </span>

      <span
        className={cn(
          'truncate text-lg',
          mobile && 'text-base min-[380px]:text-lg',
        )}
      >
        {APP_NAME}
      </span>
    </Link>
  )
}

function UserMenu({
  mobileHidden = false,
}: {
  mobileHidden?: boolean
}) {
  const { firebaseUser, profile, role } = useAuthStore()
  const navigate = useNavigate()

  if (!firebaseUser) {
    return (
      <Button
        variant="ghost"
        size="sm"
        asChild
        className={cn(
          'shrink-0',
          mobileHidden && 'hidden sm:inline-flex',
        )}
      >
        <Link to="/auth/login">Sign in</Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'size-9 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
          mobileHidden && 'hidden sm:block',
        )}
        aria-label="Open account menu"
      >
        <Avatar
          src={profile?.photoURL}
          name={profile?.displayName}
          className="size-9"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuLabel>
          <p className="truncate text-sm font-medium">
            {profile?.displayName}
          </p>

          <p className="truncate text-xs font-normal text-muted-foreground">
            {profile?.email}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate('/account')}>
          <User />
          My account
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => navigate('/account/orders')}
        >
          <Package />
          My orders
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => navigate('/account/wishlist')}
        >
          <Heart />
          Wishlist
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {role === 'admin' && (
          <DropdownMenuItem onClick={() => navigate('/admin')}>
            <LayoutDashboard />
            Admin dashboard
          </DropdownMenuItem>
        )}

        {role === 'merchant' ? (
          <DropdownMenuItem onClick={() => navigate('/merchant')}>
            <Store />
            Merchant dashboard
          </DropdownMenuItem>
        ) : role === 'customer' ? (
          <DropdownMenuItem onClick={() => navigate('/merchant')}>
            <Store />
            Sell on {APP_NAME}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={async () => {
            try {
              await authService.logout()
              toast.success('Signed out')
              navigate('/')
            } catch {
              toast.error(
                'Could not sign out. Please try again.',
              )
            }
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileMenu() {
  const { firebaseUser } = useAuthStore()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[min(20rem,calc(100vw-1rem))] overflow-y-auto"
      >
        <SheetTitle className="sr-only">
          Navigation
        </SheetTitle>

        <div className="mb-6">
          <Logo />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent',
                  isActive && 'bg-accent text-primary',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}

          {firebaseUser && (
            <>
              <div className="my-3 border-t" />

              <NavLink
                to="/account"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
              >
                <User className="size-4" />
                My account
              </NavLink>

              <NavLink
                to="/account/orders"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
              >
                <Package className="size-4" />
                My orders
              </NavLink>

              <NavLink
                to="/account/wishlist"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
              >
                <Heart className="size-4" />
                Wishlist
              </NavLink>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

function SearchBar({
  className,
}: {
  className?: string
}) {
  const [term, setTerm] = React.useState('')
  const navigate = useNavigate()

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    const normalizedTerm = term.trim()

    if (!normalizedTerm) return

    navigate(
      `/shop?q=${encodeURIComponent(normalizedTerm)}`,
    )
  }

  return (
    <form
      className={cn(
        'relative w-full min-w-0',
        className,
      )}
      onSubmit={handleSubmit}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        value={term}
        onChange={(event) =>
          setTerm(event.target.value)
        }
        placeholder="Search products, brands..."
        className="h-10 w-full min-w-0 rounded-full border-transparent bg-muted/60 pl-9 pr-3 focus-visible:bg-background"
        aria-label="Search products"
      />
    </form>
  )
}

function CartButton({
  cartCount,
}: {
  cartCount: number
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      asChild
      className="relative size-9 shrink-0"
    >
      <Link
        to="/cart"
        aria-label={`Cart with ${cartCount} items`}
      >
        <ShoppingCart className="size-[18px]" />

        {cartCount > 0 && (
          <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground">
            {cartCount > 9 ? '9+' : cartCount}
          </span>
        )}
      </Link>
    </Button>
  )
}

export function StorefrontLayout() {
  const items = useCartStore(selectItems)
  const location = useLocation()

  const cartCount = React.useMemo(
    () => getCount(items),
    [items],
  )

  React.useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    const resetScrollPosition = () => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      })

      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }

    resetScrollPosition()

    const animationFrame = window.requestAnimationFrame(
      resetScrollPosition,
    )

    const shortTimeout = window.setTimeout(
      resetScrollPosition,
      50,
    )

    const contentTimeout = window.setTimeout(
      resetScrollPosition,
      200,
    )

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(shortTimeout)
      window.clearTimeout(contentTimeout)
    }
  }, [
    location.key,
    location.pathname,
    location.search,
  ])

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col">
      {!isFirebaseConfigured && (
        <div className="w-full break-words bg-warning/15 px-4 py-2 text-center text-xs font-medium text-warning">
          Firebase is not configured — copy
          .env.example to .env.local and add your project
          keys, then restart the development server.
        </div>
      )}

      <header className="glass sticky top-0 z-40 w-full border-b">
        <div className="mx-auto flex h-16 w-full min-w-0 items-center px-3 lg:hidden">
          <MobileMenu />

          <div className="ml-1 min-w-0 flex-1">
            <Logo mobile />
          </div>

          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <ThemeToggle />
            <NotificationsBell />
            <CartButton cartCount={cartCount} />
            <UserMenu mobileHidden />
          </div>
        </div>

        <div className="mx-auto hidden h-16 w-full max-w-7xl items-center gap-4 px-6 sm:p-5 lg:flex">
          <Logo />

          <nav className="flex shrink-0 items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <SearchBar className="ml-auto max-w-md" />

          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <NotificationsBell />
            <CartButton cartCount={cartCount} />
            <UserMenu />
          </div>
        </div>

        <div className="w-full border-t px-3 pb-2 pt-2 lg:hidden">
          <SearchBar />
        </div>
      </header>

      <main className="w-full min-w-0">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}

function Footer() {
  const [email, setEmail] = React.useState('')
  const [isSubmitting, setIsSubmitting] =
    React.useState(false)

  const handleSubscribe = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    const normalizedEmail = email.trim()

    if (!normalizedEmail || isSubmitting) return

    try {
      setIsSubmitting(true)

      await cmsService.subscribeNewsletter(
        normalizedEmail,
      )

      toast.success('Subscribed to the newsletter!')
      setEmail('')
    } catch {
      toast.error(
        'Subscription failed. Try again later.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <footer className="mt-8 w-full border-t bg-card sm:mt-12">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-6 sm:grid-cols-2 sm:px-6 sm:py-10 lg:grid-cols-5">
        <div className="min-w-0 sm:col-span-2 lg:col-span-2">
          <Logo />

          <p className="mt-3 max-w-sm break-words text-sm leading-6 text-muted-foreground">
            {APP_NAME} is a multi-vendor marketplace
            where independent brands sell directly to you.
            Cash on delivery, verified merchants, buyer
            protection.
          </p>

          <form
            onSubmit={handleSubscribe}
            className="mt-5 grid w-full min-w-0 grid-cols-1 gap-2 sm:max-w-md sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="Email for our newsletter"
              aria-label="Newsletter email"
              className="w-full min-w-0"
            />

            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full sm:w-auto"
            >
              Subscribe
            </Button>
          </form>
        </div>

        <FooterColumn
          title="Shop"
          links={[
            { to: '/shop', label: 'All products' },
            { to: '/categories', label: 'Categories' },
            { to: '/stores', label: 'Stores' },
            {
              to: '/shop?sort=best_selling',
              label: 'Best sellers',
            },
            {
              to: '/shop?filter=sale',
              label: 'On sale',
            },
          ]}
        />

        <FooterColumn
          title="Company"
          links={[
            { to: '/about', label: 'About us' },
            { to: '/blog', label: 'Blog' },
            { to: '/contact', label: 'Contact' },
            { to: '/faq', label: 'FAQ' },
            {
              to: '/merchant',
              label: `Sell on ${APP_NAME}`,
            },
          ]}
        />

        <FooterColumn
          title="Policies"
          links={[
            {
              to: '/pages/terms',
              label: 'Terms of service',
            },
            {
              to: '/pages/privacy',
              label: 'Privacy policy',
            },
            {
              to: '/pages/shipping-policy',
              label: 'Shipping policy',
            },
            {
              to: '/pages/return-policy',
              label: 'Return policy',
            },
          ]}
        />
      </div>

      <div className="border-t px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {APP_NAME}. All
        rights reserved.
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: {
    to: string
    label: string
  }[]
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-3 text-sm font-semibold">
        {title}
      </h4>

      <ul className="space-y-2">
        {links.map((link) => (
          <li key={`${link.to}-${link.label}`}>
            <Link
              to={link.to}
              className="inline-block max-w-full break-words text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}