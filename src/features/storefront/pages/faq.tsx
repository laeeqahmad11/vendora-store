import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { SEO } from '@/components/shared/seo'
import { cmsService } from '@/services/cms.service'
import { cn } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'
import type { FAQ } from '@/types'

const FALLBACK_FAQS: FAQ[] = [
  {
    id: 'f1',
    question: 'How do I pay for my order?',
    answer: `All orders on ${APP_NAME} are paid with cash on delivery. You pay the courier when your order arrives — no card or online payment needed.`,
    category: 'Orders',
  },
  {
    id: 'f2',
    question: 'Can I order from multiple stores at once?',
    answer: 'Yes! Add products from any number of stores to your cart. At checkout we automatically split your purchase into one order per store, and each store ships separately.',
    category: 'Orders',
  },
  {
    id: 'f3',
    question: 'How can I track my order?',
    answer: 'Go to My Account → Orders to see a live status timeline for every order: pending, confirmed, packed, dispatched, and delivered.',
    category: 'Orders',
  },
  {
    id: 'f4',
    question: 'Can I cancel my order?',
    answer: 'You can cancel an order from your account while it is still pending or confirmed. Once the merchant has packed it, cancellation is no longer possible.',
    category: 'Orders',
  },
  {
    id: 'f5',
    question: 'How do returns work?',
    answer: 'After your order is delivered you can request a return from the order page, stating the reason. The merchant will review your request and arrange the return.',
    category: 'Returns',
  },
  {
    id: 'f6',
    question: `How do I open a store on ${APP_NAME}?`,
    answer: 'Click "Sell on Vendora" in the menu, fill in your store application, and our team will review it. Once approved you can start listing products right away.',
    category: 'Selling',
  },
]

function FaqItem({ faq, open, onToggle }: { faq: FAQ; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold">{faq.question}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FAQPage() {
  const { data, isLoading } = useQuery({ queryKey: ['faqs'], queryFn: () => cmsService.listFAQs() })
  const [openId, setOpenId] = React.useState<string | null>(null)

  const faqs = data?.length ? data : FALLBACK_FAQS
  const categories = [...new Set(faqs.map((f) => f.category ?? 'General'))]

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <SEO title="FAQ" description="Frequently asked questions about ordering, delivery, returns and selling." />

      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <HelpCircle className="size-7 text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Can't find what you need? <a href="/contact" className="text-primary hover:underline">Contact us</a>.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-10 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-10 space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
              <div className="space-y-3">
                {faqs
                  .filter((f) => (f.category ?? 'General') === category)
                  .map((faq) => (
                    <FaqItem
                      key={faq.id}
                      faq={faq}
                      open={openId === faq.id}
                      onToggle={() => setOpenId((id) => (id === faq.id ? null : faq.id))}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
