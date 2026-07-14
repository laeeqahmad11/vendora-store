/**
 * Development seed script.
 *
 * Uses the Firebase Admin SDK (bypasses security rules), so it needs a
 * service-account key:
 *   1. Firebase Console → Project settings → Service accounts → Generate new private key
 *   2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   3. node scripts/seed.mjs [--admin-email you@example.com]
 *
 * Passing --admin-email elevates that existing Auth user to the admin role.
 * Idempotent-ish: uses fixed document ids so re-running overwrites rather
 * than duplicates.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const now = () => FieldValue.serverTimestamp()

const img = (seed, w = 800, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`

const CATEGORIES = [
  { id: 'cat-electronics', name: 'Electronics', slug: 'electronics', featured: true, sortOrder: 1 },
  { id: 'cat-fashion', name: 'Fashion', slug: 'fashion', featured: true, sortOrder: 2 },
  { id: 'cat-home', name: 'Home & Living', slug: 'home-living', featured: true, sortOrder: 3 },
  { id: 'cat-beauty', name: 'Beauty & Care', slug: 'beauty-care', featured: true, sortOrder: 4 },
  { id: 'cat-sports', name: 'Sports & Outdoors', slug: 'sports-outdoors', featured: true, sortOrder: 5 },
  { id: 'cat-phones', name: 'Smartphones', slug: 'smartphones', parentId: 'cat-electronics', sortOrder: 10 },
  { id: 'cat-audio', name: 'Audio', slug: 'audio', parentId: 'cat-electronics', sortOrder: 11 },
  { id: 'cat-mens', name: "Men's Wear", slug: 'mens-wear', parentId: 'cat-fashion', sortOrder: 12 },
  { id: 'cat-womens', name: "Women's Wear", slug: 'womens-wear', parentId: 'cat-fashion', sortOrder: 13 },
]

const BRANDS = [
  { id: 'brand-nova', name: 'Nova', slug: 'nova', featured: true },
  { id: 'brand-alta', name: 'Alta', slug: 'alta', featured: true },
  { id: 'brand-kyro', name: 'Kyro', slug: 'kyro', featured: false },
  { id: 'brand-verve', name: 'Verve', slug: 'verve', featured: true },
]

async function ensureUser(email, displayName, role, id) {
  let user
  try {
    user = await getAuth().getUserByEmail(email)
  } catch {
    user = await getAuth().createUser({ uid: id, email, password: 'password123', displayName, emailVerified: true })
    console.log(`  created auth user ${email} (password: password123)`)
  }
  await db.doc(`users/${user.uid}`).set(
    { email, displayName, role, suspended: false, emailVerified: true, createdAt: now(), updatedAt: now() },
    { merge: true },
  )
  return user.uid
}

async function main() {
  console.log('Seeding categories & brands…')
  for (const c of CATEGORIES) {
    await db.doc(`categories/${c.id}`).set({ ...c, parentId: c.parentId ?? null, productCount: 0, createdAt: now() })
  }
  for (const b of BRANDS) await db.doc(`brands/${b.id}`).set({ ...b, createdAt: now() })

  console.log('Seeding demo users…')
  const merchant1 = await ensureUser('merchant1@vendora.dev', 'Maya Chen', 'merchant', 'seed-merchant-1')
  const merchant2 = await ensureUser('merchant2@vendora.dev', 'Omar Farouk', 'merchant', 'seed-merchant-2')
  const customer = await ensureUser('customer@vendora.dev', 'Sam Taylor', 'customer', 'seed-customer-1')

  console.log('Seeding stores…')
  const stores = [
    {
      id: 'store-nova-tech', ownerId: merchant1, name: 'Nova Tech', slug: 'nova-tech',
      description: 'Cutting-edge gadgets and audio gear at honest prices.',
      email: 'hello@novatech.dev', phone: '+1 555 0101', businessName: 'Nova Tech LLC',
      logoUrl: img('novatech-logo', 200, 200), bannerUrl: img('novatech-banner', 1400, 400),
      status: 'approved', verified: true, rating: 4.7, ratingCount: 128, productCount: 6, totalSales: 3400,
    },
    {
      id: 'store-atelier', ownerId: merchant2, name: 'Atelier Verve', slug: 'atelier-verve',
      description: 'Contemporary fashion from independent designers.',
      email: 'studio@atelierverve.dev', phone: '+1 555 0102', businessName: 'Atelier Verve Inc.',
      logoUrl: img('atelier-logo', 200, 200), bannerUrl: img('atelier-banner', 1400, 400),
      status: 'approved', verified: true, rating: 4.5, ratingCount: 86, productCount: 6, totalSales: 2100,
    },
  ]
  for (const s of stores) {
    await db.doc(`stores/${s.id}`).set({ ...s, createdAt: now(), updatedAt: now() })
  }
  await db.doc(`users/${merchant1}`).set({ storeId: 'store-nova-tech' }, { merge: true })
  await db.doc(`users/${merchant2}`).set({ storeId: 'store-atelier' }, { merge: true })

  console.log('Seeding products…')
  const P = (id, storeId, merchantId, name, price, categoryId, extra = {}) => ({
    id, storeId, merchantId, name,
    slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-4)}`,
    description: `${name} — a customer favourite from our curated collection. Built to last, designed to delight, and covered by our hassle-free return policy.`,
    images: [img(`${id}-1`), img(`${id}-2`), img(`${id}-3`)],
    price, compareAtPrice: extra.compareAtPrice ?? null, currency: 'USD',
    sku: id.toUpperCase(), stock: extra.stock ?? 40, lowStockThreshold: 5, minOrderQty: 1, maxOrderQty: 10,
    categoryId, subcategoryId: extra.subcategoryId ?? null, brandId: extra.brandId ?? 'brand-nova',
    tags: extra.tags ?? ['new'], specifications: extra.specs ?? [{ label: 'Warranty', value: '12 months' }],
    warranty: '12 months', returnPolicy: '14-day free returns', shippingInfo: 'Ships in 1–2 business days',
    status: 'approved', featured: extra.featured ?? false, trending: extra.trending ?? false,
    recommended: extra.recommended ?? false, flashSale: extra.flashSale ?? null,
    rating: extra.rating ?? 4.2, ratingCount: extra.ratingCount ?? 12,
    soldCount: extra.soldCount ?? 25, viewCount: extra.viewCount ?? 300,
    variantOptions: extra.variantOptions ?? null, variants: extra.variants ?? null,
    createdAt: now(), updatedAt: now(), publishedAt: Date.now(),
  })

  const flashEnd = Date.now() + 1000 * 60 * 60 * 48
  const products = [
    P('prod-aurora-buds', 'store-nova-tech', merchant1, 'Aurora Wireless Earbuds', 59.99, 'cat-electronics', {
      subcategoryId: 'cat-audio', compareAtPrice: 89.99, featured: true, trending: true, soldCount: 210, rating: 4.8, ratingCount: 64,
    }),
    P('prod-pulse-watch', 'store-nova-tech', merchant1, 'Pulse Smart Watch 2', 129.0, 'cat-electronics', {
      featured: true, soldCount: 140, rating: 4.6, ratingCount: 41,
      flashSale: { active: true, endsAt: flashEnd, salePrice: 99.0 },
    }),
    P('prod-volt-charger', 'store-nova-tech', merchant1, 'Volt 65W GaN Charger', 34.5, 'cat-electronics', {
      recommended: true, soldCount: 320, rating: 4.9, ratingCount: 98,
    }),
    P('prod-echo-speaker', 'store-nova-tech', merchant1, 'Echo Mini Speaker', 45.0, 'cat-electronics', {
      subcategoryId: 'cat-audio', trending: true, compareAtPrice: 60, soldCount: 95,
    }),
    P('prod-lumen-lamp', 'store-nova-tech', merchant1, 'Lumen Desk Lamp Pro', 42.0, 'cat-home', { recommended: true, soldCount: 60 }),
    P('prod-drift-mouse', 'store-nova-tech', merchant1, 'Drift Ergonomic Mouse', 27.9, 'cat-electronics', { stock: 4, soldCount: 75 }),
    P('prod-linen-shirt', 'store-atelier', merchant2, 'Breeze Linen Shirt', 48.0, 'cat-fashion', {
      subcategoryId: 'cat-mens', brandId: 'brand-verve', featured: true, trending: true, rating: 4.4, ratingCount: 33, soldCount: 120,
      variantOptions: { Size: ['S', 'M', 'L', 'XL'], Color: ['White', 'Sand', 'Navy'] },
      variants: ['S','M','L','XL'].flatMap((s) => ['White','Sand','Navy'].map((c) => ({
        id: `v-${s}-${c}`.toLowerCase(), options: { Size: s, Color: c }, stock: 8, sku: `LNS-${s}-${c[0]}`,
      }))),
    }),
    P('prod-midi-dress', 'store-atelier', merchant2, 'Solstice Midi Dress', 72.0, 'cat-fashion', {
      subcategoryId: 'cat-womens', brandId: 'brand-verve', compareAtPrice: 95, featured: true, rating: 4.7, ratingCount: 52, soldCount: 88,
      variantOptions: { Size: ['XS', 'S', 'M', 'L'] },
      variants: ['XS','S','M','L'].map((s) => ({ id: `v-${s}`.toLowerCase(), options: { Size: s }, stock: 10, sku: `SMD-${s}` })),
    }),
    P('prod-wool-coat', 'store-atelier', merchant2, 'Harbor Wool Coat', 189.0, 'cat-fashion', {
      subcategoryId: 'cat-womens', brandId: 'brand-alta', recommended: true, soldCount: 34, rating: 4.9, ratingCount: 21,
    }),
    P('prod-canvas-tote', 'store-atelier', merchant2, 'Everyday Canvas Tote', 24.0, 'cat-fashion', {
      brandId: 'brand-kyro', trending: true, soldCount: 260, flashSale: { active: true, endsAt: flashEnd, salePrice: 18.0 },
    }),
    P('prod-silk-scarf', 'store-atelier', merchant2, 'Meridian Silk Scarf', 39.0, 'cat-fashion', { brandId: 'brand-alta', soldCount: 47 }),
    P('prod-cedar-candle', 'store-atelier', merchant2, 'Cedar & Sage Candle', 19.5, 'cat-home', { brandId: 'brand-kyro', recommended: true, soldCount: 150, rating: 4.5, ratingCount: 40 }),
  ]
  for (const p of products) {
    const { id, ...data } = p
    await db.doc(`products/${id}`).set(data)
  }

  console.log('Seeding coupons, banners, CMS…')
  await db.doc('coupons/coupon-welcome10').set({
    code: 'WELCOME10', type: 'percentage', value: 10, minOrderAmount: 30, maxDiscount: 25,
    usageLimit: 1000, usedCount: 0, active: true, createdAt: now(), updatedAt: now(),
  })
  await db.doc('coupons/coupon-nova5').set({
    storeId: 'store-nova-tech', code: 'NOVA5', type: 'fixed', value: 5, minOrderAmount: 25,
    usageLimit: 500, usedCount: 0, active: true, createdAt: now(), updatedAt: now(),
  })
  await db.doc('banners/banner-hero-1').set({
    title: 'Mid-Season Sale', subtitle: 'Up to 40% off across electronics and fashion',
    imageUrl: img('hero-sale', 1600, 640), linkUrl: '/shop?filter=sale', placement: 'hero',
    active: true, sortOrder: 1, createdAt: now(), updatedAt: now(),
  })
  await db.doc('banners/banner-hero-2').set({
    title: 'New Arrivals Weekly', subtitle: 'Fresh drops from independent brands every Friday',
    imageUrl: img('hero-new', 1600, 640), linkUrl: '/shop?sort=newest', placement: 'hero',
    active: true, sortOrder: 2, createdAt: now(), updatedAt: now(),
  })

  const faqs = [
    { q: 'How does Cash on Delivery work?', a: 'You pay in cash when your order arrives at your door. The merchant confirms receipt and your order is marked completed.', o: 1 },
    { q: 'How do I become a seller?', a: 'Create an account, open the Merchant area, and submit your store application. Our team reviews applications within 48 hours.', o: 2 },
    { q: 'Can I return a product?', a: 'Yes — most products include a 14-day return window. Open a return request from your order page.', o: 3 },
    { q: 'How do I track my order?', a: 'Every order has a live timeline in My Account → Orders, and you get a notification at every status change.', o: 4 },
  ]
  for (const [i, f] of faqs.entries()) {
    await db.doc(`faqs/faq-${i + 1}`).set({ question: f.q, answer: f.a, sortOrder: f.o, createdAt: now(), updatedAt: now() })
  }

  const pages = {
    about: ['About Vendora', 'Vendora is a multi-vendor marketplace connecting independent brands with customers everywhere. Every merchant is vetted and every order is protected by our cash-on-delivery guarantee.'],
    terms: ['Terms of Service', 'By using Vendora you agree to our marketplace terms. Merchants are independent sellers responsible for their listings; Vendora provides the platform, buyer protection, and dispute resolution.'],
    privacy: ['Privacy Policy', 'We collect only the data needed to operate the marketplace: your account details, addresses, and order history. We never sell personal data to third parties.'],
    'shipping-policy': ['Shipping Policy', 'Merchants ship orders within 1–2 business days. Delivery times vary by region; you will receive status notifications at every step.'],
    'return-policy': ['Return Policy', 'Most items can be returned within 14 days of delivery. Start a return from your order page and the merchant will arrange pickup or drop-off.'],
    contact: ['Contact Us', 'Reach our support team at support@vendora.dev or through the support tickets in your account. We reply within one business day.'],
  }
  for (const [id, [title, content]] of Object.entries(pages)) {
    await db.doc(`pages/${id}`).set({ title, content, createdAt: now(), updatedAt: now() })
  }

  await db.doc('blogs/blog-welcome').set({
    title: 'Welcome to Vendora', slug: 'welcome-to-vendora',
    excerpt: 'Why we built a marketplace for independent brands — and what it means for you.',
    content: 'Vendora started with a simple idea: independent brands deserve the same tools as retail giants. Today, merchants across the platform run their entire business — catalog, orders, promotions, and analytics — from one dashboard, while customers enjoy cash-on-delivery convenience and verified-seller trust.\n\nThis blog will share seller spotlights, buying guides, and platform updates. Welcome aboard!',
    coverUrl: img('blog-welcome', 1200, 630), author: 'Vendora Team', tags: ['announcement'],
    published: true, createdAt: now(), updatedAt: now(),
  })

  await db.doc('settings/platform').set({
    name: 'Vendora', tagline: 'The multi-vendor marketplace for modern brands',
    supportEmail: 'support@vendora.dev', currency: 'USD', commissionPercent: 10,
    announcement: { text: 'Free launch-month promotion: 0% commission for new merchants!', active: true },
    createdAt: now(), updatedAt: now(),
  })

  const adminFlag = process.argv.indexOf('--admin-email')
  if (adminFlag !== -1 && process.argv[adminFlag + 1]) {
    const email = process.argv[adminFlag + 1]
    try {
      const user = await getAuth().getUserByEmail(email)
      await db.doc(`users/${user.uid}`).set({ role: 'admin' }, { merge: true })
      console.log(`Elevated ${email} to admin.`)
    } catch {
      console.warn(`No auth user found for ${email} — sign up in the app first, then re-run.`)
    }
  } else {
    const adminUid = await ensureUser('admin@vendora.dev', 'Platform Admin', 'admin', 'seed-admin-1')
    console.log(`Demo admin ready: admin@vendora.dev / password123 (uid ${adminUid})`)
  }

  console.log(`\nDemo customer: customer@vendora.dev / password123 (uid ${customer})`)
  console.log('Demo merchants: merchant1@vendora.dev, merchant2@vendora.dev / password123')
  console.log('Seed complete ✔')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
