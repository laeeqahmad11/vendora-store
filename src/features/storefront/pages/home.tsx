import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  Quote,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { RatingStars, Avatar } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { productsService } from '@/services/products.service'
import { catalogService } from '@/services/catalog.service'
import { storesService } from '@/services/stores.service'
import { cmsService } from '@/services/cms.service'
import { discountsService } from '@/services/discounts.service'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'
import { getErrorMessage } from '@/lib/utils'
import { ProductShelf } from '../components/product-shelf'
import { Countdown } from '../components/countdown'
import { RecentlyViewedShelf } from '../components/recently-viewed-shelf'

// ------------------------------------------------------------------- Hero

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-background to-primary/5">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"
        >
          <Sparkles className="size-3.5 text-primary" /> {APP_TAGLINE}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
        >
          Shop unique products from{' '}
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            independent brands
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          Thousands of products from verified merchants. Cash on delivery, easy returns and buyer
          protection on every order.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button size="lg" asChild>
            <Link to="/shop">
              <ShoppingBag /> Start shopping
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/stores">
              <StoreIcon /> Browse stores
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  )
}

// -------------------------------------------------------- Promo carousel

interface Slide {
  key: string
  title: string
  subtitle?: string
  imageUrl?: string
  linkUrl?: string
}

function PromoCarousel() {
  const banners = useQuery({ queryKey: ['banners', 'active'], queryFn: () => cmsService.listBanners(true) })
  const promos = useQuery({
    queryKey: ['promotions', 'hero'],
    queryFn: () => discountsService.listActivePromotions('hero'),
  })

  const slides: Slide[] = [
    ...(banners.data?.filter((b) => b.placement === 'hero') ?? []).map((b) => ({
      key: `banner-${b.id}`,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
    })),
    ...(promos.data ?? []).map((p) => ({
      key: `promo-${p.id}`,
      title: p.title,
      subtitle: p.subtitle,
      imageUrl: p.imageUrl,
      linkUrl: p.linkUrl,
    })),
  ]

  const [index, setIndex] = React.useState(0)
  const count = slides.length

  React.useEffect(() => {
    if (count < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 5000)
    return () => clearInterval(id)
  }, [count])

  if (banners.isLoading || promos.isLoading) {
    return (
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <Skeleton className="h-48 w-full rounded-2xl sm:h-64" />
      </section>
    )
  }
  if (!count) return null

  const slide = slides[Math.min(index, count - 1)]

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Promotions">
      <div className="relative overflow-hidden rounded-2xl border bg-card">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.key}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35 }}
            className="relative flex h-48 items-center sm:h-64"
          >
            {slide.imageUrl && (
              <>
                <img src={slide.imageUrl} alt={slide.title} className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
              </>
            )}
            <div className={slide.imageUrl ? 'relative z-10 px-6 text-white sm:px-10' : 'px-6 sm:px-10'}>
              <h3 className="max-w-lg text-xl font-bold sm:text-3xl">{slide.title}</h3>
              {slide.subtitle && (
                <p className={`mt-2 max-w-md text-sm sm:text-base ${slide.imageUrl ? 'text-white/85' : 'text-muted-foreground'}`}>
                  {slide.subtitle}
                </p>
              )}
              {slide.linkUrl && (
                <Button size="sm" className="mt-4" asChild>
                  <Link to={slide.linkUrl}>
                    Shop now <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow backdrop-blur transition-transform hover:scale-110"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setIndex((i) => (i + 1) % count)}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow backdrop-blur transition-transform hover:scale-110"
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// -------------------------------------------------------- Category grid

function CategoryGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ['categories', 'top'],
    queryFn: () => catalogService.listTopCategories(),
  })

  if (!isLoading && !data?.length) return null

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Shop by category</h2>
        <Link to="/categories" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          All categories <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)
          : data!.slice(0, 12).map((cat) => (
              <Link
                key={cat.id}
                to={`/shop?category=${cat.id}`}
                className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
              >
                {cat.imageUrl ? (
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <ShoppingBag className="size-8 text-muted-foreground/40" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                  <p className="text-sm font-semibold text-white">{cat.name}</p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------ Flash sale strip

function FlashSaleStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'flash-sale'],
    queryFn: () => productsService.listFlashSale(8),
  })

  if (!isLoading && !data?.length) return null
  const soonestEnd = data?.length ? Math.min(...data.map((p) => p.flashSale?.endsAt ?? Infinity)) : 0

  return (
    <div className="border-y bg-destructive/5 py-10">
      <ProductShelf
        title="Flash Sale"
        subtitle="Limited-time deals — grab them before they're gone"
        products={data}
        loading={isLoading}
        viewAllTo="/shop?filter=sale"
        accessory={
          soonestEnd > 0 && Number.isFinite(soonestEnd) ? (
            <div className="flex items-center gap-2">
              <Zap className="size-5 fill-warning text-warning" />
              <Countdown endsAt={soonestEnd} />
            </div>
          ) : undefined
        }
      />
    </div>
  )
}

// -------------------------------------------------------- Stores strip

function TopStoresStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ['stores', 'approved', 'strip'],
    queryFn: () => storesService.listApproved(8),
  })

  if (!isLoading && !data?.length) return null

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Top stores</h2>
        <Link to="/stores" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          All stores <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : data!.slice(0, 8).map((store) => (
              <Link
                key={store.id}
                to={`/stores/${store.slug}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <Avatar src={store.logoUrl} name={store.name} className="size-12" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                    {store.name}
                    {store.verified && <BadgeCheck className="size-3.5 shrink-0 text-primary" />}
                  </p>
                  <RatingStars rating={store.rating} count={store.ratingCount} />
                  <p className="text-xs text-muted-foreground">{store.productCount} products</p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  )
}

// -------------------------------------------------------- Testimonials

const TESTIMONIALS = [
  {
    name: 'Sarah M.',
    role: 'Verified buyer',
    text: `I love that I can order from multiple small shops in one checkout and pay when it arrives. ${APP_NAME} has become my go-to.`,
  },
  {
    name: 'Omar K.',
    role: 'Verified buyer',
    text: 'Fast delivery and the return process was painless. The order tracking timeline is a really nice touch.',
  },
  {
    name: 'Lina A.',
    role: 'Store owner',
    text: `Selling on ${APP_NAME} took my side business to a full-time income. The marketplace brings customers I could never reach alone.`,
  },
]

function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <h2 className="mb-6 text-center text-xl font-bold tracking-tight sm:text-2xl">What people are saying</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <motion.figure
            key={t.name}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            <Quote className="size-5 text-primary/50" />
            <blockquote className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.text}</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <Avatar name={t.name} />
              <div>
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------- Newsletter CTA

function NewsletterCTA() {
  const [email, setEmail] = React.useState('')
  const subscribe = useMutation({
    mutationFn: (value: string) => cmsService.subscribeNewsletter(value),
    onSuccess: () => {
      toast.success('You are subscribed — welcome aboard!')
      setEmail('')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary/70 px-6 py-12 text-center text-primary-foreground sm:px-12">
        <Mail className="mx-auto size-8 opacity-80" />
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Get deals in your inbox</h2>
        <p className="mx-auto mt-2 max-w-md text-sm opacity-85">
          Subscribe for flash-sale alerts, new arrivals and exclusive coupon codes. No spam, ever.
        </p>
        <form
          className="mx-auto mt-6 flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (email.trim()) subscribe.mutate(email.trim())
          }}
        >
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="bg-background text-foreground"
          />
          <Button type="submit" variant="secondary" loading={subscribe.isPending}>
            Subscribe
          </Button>
        </form>
      </div>
    </section>
  )
}

// -------------------------------------------------------------- Page

export default function HomePage() {
  const bestSellers = useQuery({ queryKey: ['products', 'best-sellers'], queryFn: () => productsService.listBestSellers(8) })
  const newArrivals = useQuery({ queryKey: ['products', 'new-arrivals'], queryFn: () => productsService.listNewArrivals(8) })
  const trending = useQuery({ queryKey: ['products', 'shelf', 'trending'], queryFn: () => productsService.listShelf('trending', 8) })
  const featured = useQuery({ queryKey: ['products', 'shelf', 'featured'], queryFn: () => productsService.listShelf('featured', 8) })

  return (
    <div className="space-y-14 pb-4 sm:space-y-16">
      <SEO description={`${APP_NAME} — shop thousands of products from independent verified merchants with cash on delivery.`} />
      <Hero />
      <PromoCarousel />
      <CategoryGrid />
      <FlashSaleStrip />
      <ProductShelf
        title="Best sellers"
        subtitle="Most-loved products across the marketplace"
        products={bestSellers.data}
        loading={bestSellers.isLoading}
        viewAllTo="/shop?sort=best_selling"
      />
      <ProductShelf
        title="New arrivals"
        subtitle="Fresh finds from our merchants"
        products={newArrivals.data}
        loading={newArrivals.isLoading}
        viewAllTo="/shop?sort=newest"
      />
      <ProductShelf
        title="Trending now"
        subtitle="What everyone is looking at"
        products={trending.data}
        loading={trending.isLoading}
        viewAllTo="/shop?sort=popularity"
      />
      <ProductShelf
        title="Featured picks"
        subtitle="Hand-picked by our team"
        products={featured.data}
        loading={featured.isLoading}
        viewAllTo="/shop"
      />
      <TopStoresStrip />
      <Testimonials />
      <RecentlyViewedShelf />
      <NewsletterCTA />
    </div>
  )
}
