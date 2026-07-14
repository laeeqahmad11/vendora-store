import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { cmsService } from '@/services/cms.service'
import { formatDate } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'

const DEFAULT_PAGES: Record<string, { title: string; content: string }> = {
  terms: {
    title: 'Terms of Service',
    content: `Welcome to ${APP_NAME}. By using this marketplace you agree to the following terms.

1. The marketplace
${APP_NAME} connects independent merchants with customers. Each product is sold by the merchant named on the product page, not by ${APP_NAME} itself.

2. Orders and payment
All orders are paid with cash on delivery. Placing an order is a commitment to accept and pay for the delivery, unless you cancel while the order is still pending or confirmed.

3. Accounts
You are responsible for keeping your account credentials safe and for all activity performed with your account.

4. Reviews and content
Reviews must reflect genuine experiences. We may remove content that is abusive, fraudulent or violates the law.

5. Liability
${APP_NAME} provides the platform "as is" and mediates disputes between customers and merchants in good faith.`,
  },
  privacy: {
    title: 'Privacy Policy',
    content: `Your privacy matters to us.

What we collect
We collect the information you provide when creating an account, placing orders (name, phone, delivery address), and interacting with the marketplace (reviews, wishlists, support tickets).

How we use it
Your data is used to fulfil orders, provide customer support, and improve the shopping experience. Delivery details are shared only with the merchant fulfilling your order.

What we don't do
We never sell your personal data to third parties.

Your choices
You can update your profile and addresses at any time from your account, and you can contact support to request deletion of your account data.`,
  },
  'shipping-policy': {
    title: 'Shipping Policy',
    content: `Shipping on ${APP_NAME} is handled directly by each merchant.

Delivery times
Most orders are delivered within 2–7 business days depending on your location and the merchant's dispatch times. You can track every step from your account's order page.

Shipping fees
Delivery fees, if any, are calculated and collected at delivery together with your cash payment.

Multiple stores
If your cart contains items from several stores, each store ships separately and you may receive multiple deliveries.`,
  },
  'return-policy': {
    title: 'Return Policy',
    content: `We want you to love what you ordered.

Requesting a return
After your order is delivered, you can request a return from the order page in your account, stating the reason. The merchant will review the request and contact you to arrange it.

Conditions
Items must be unused and in their original packaging. Some categories (perishables, personalised items) may be excluded from returns at the merchant's discretion.

Refunds
Since orders are paid in cash on delivery, refunds for approved returns are settled directly between you and the merchant, with ${APP_NAME} support available to mediate.`,
  },
}

export default function StaticPageRenderer() {
  const { pageId = '' } = useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => cmsService.getPage(pageId),
    enabled: !!pageId,
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const fallback = DEFAULT_PAGES[pageId]
  const page = data ?? (fallback ? { id: pageId, title: fallback.title, content: fallback.content, updatedAt: 0 } : null)

  if (!page) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={FileText}
          title="Page not found"
          description="The page you're looking for doesn't exist."
          action={
            <Button asChild>
              <Link to="/">Back home</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <SEO title={page.title} />
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      {page.updatedAt > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Last updated {formatDate(page.updatedAt)}</p>
      )}
      <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{page.content}</div>
    </div>
  )
}
