import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Banknote, HeartHandshake, ShieldCheck, Store, Truck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO } from '@/components/shared/seo'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

const VALUES = [
  {
    icon: Store,
    title: 'Independent merchants',
    text: 'Every store on our marketplace is run by a real, verified small business — not a faceless warehouse.',
  },
  {
    icon: Banknote,
    title: 'Cash on delivery',
    text: 'No cards, no prepayment risk. Inspect your order and pay in cash when it arrives at your door.',
  },
  {
    icon: ShieldCheck,
    title: 'Buyer protection',
    text: 'Order tracking, easy cancellations and a straightforward return process on every purchase.',
  },
  {
    icon: Truck,
    title: 'Fast local delivery',
    text: 'Merchants ship directly to you, cutting out middlemen and long shipping times.',
  },
  {
    icon: Users,
    title: 'Community first',
    text: 'Reviews come from verified buyers, and your feedback directly shapes the marketplace.',
  },
  {
    icon: HeartHandshake,
    title: 'Fair for sellers',
    text: 'Transparent commissions and tools that help small brands grow into big ones.',
  },
]

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <SEO title="About us" description={`Learn about ${APP_NAME} — ${APP_TAGLINE}.`} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          About <span className="text-primary">{APP_NAME}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {APP_NAME} is a multi-vendor marketplace built for independent brands and the people who love
          them. We connect thousands of shoppers with verified small businesses, with cash on delivery and
          buyer protection built into every order.
        </p>
      </motion.div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {VALUES.map((v, i) => (
          <motion.div
            key={v.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10">
              <v.icon className="size-5 text-primary" />
            </div>
            <h2 className="mt-4 font-semibold">{v.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{v.text}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl bg-gradient-to-r from-primary to-primary/70 px-6 py-12 text-center text-primary-foreground">
        <h2 className="text-2xl font-bold tracking-tight">Want to sell on {APP_NAME}?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm opacity-85">
          Join hundreds of merchants growing their business on our marketplace. Applying takes five minutes.
        </p>
        <Button size="lg" variant="secondary" className="mt-6" asChild>
          <Link to="/merchant">Open your store</Link>
        </Button>
      </div>
    </div>
  )
}
