import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Package, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SEO } from '@/components/shared/seo'

interface SuccessState {
  orderIds?: string[]
  orderNumbers?: string[]
}

export default function OrderSuccessPage() {
  const location = useLocation()
  const state = (location.state ?? {}) as SuccessState

  const orderNumbers = state.orderNumbers ?? []
  const orderIds = state.orderIds ?? []

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden px-4 py-12 text-center sm:px-6 sm:py-16">
      <SEO title="Order placed" />

      <div className="flex w-full flex-col items-center">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 14,
          }}
          className="flex size-20 shrink-0 items-center justify-center rounded-full bg-success/15 sm:size-24"
        >
          <CheckCircle2 className="size-10 text-success sm:size-12" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 w-full max-w-full break-words px-1 text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Thank you for your order!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-3 w-full max-w-md break-words px-1 text-sm leading-6 text-muted-foreground"
        >
          {orderIds.length > 1
            ? `We've placed ${orderIds.length} orders, one for each store. The merchants have been notified and will start preparing your items.`
            : 'The merchant has been notified and will start preparing your items. Pay in cash when your order arrives.'}
        </motion.p>

        {orderNumbers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-8 w-full space-y-3"
          >
            {orderNumbers.map((orderNumber, index) => (
              <Card
                key={`${orderNumber}-${index}`}
                className="flex min-w-0 flex-col gap-3 p-4 text-left sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Package className="size-5 text-primary" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {orderNumber}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Cash on delivery
                    </p>
                  </div>
                </div>

                {orderIds[index] && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 sm:w-auto"
                    asChild
                  >
                    <Link to={`/account/orders/${orderIds[index]}`}>
                      Track order
                    </Link>
                  </Button>
                )}
              </Card>
            ))}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-8 grid w-full gap-3 sm:flex sm:flex-wrap sm:justify-center"
        >
          <Button className="w-full sm:w-auto" asChild>
            <Link to="/account/orders">
              <Package className="size-4" />
              View my orders
            </Link>
          </Button>

          <Button
            variant="outline"
            className="w-full sm:w-auto"
            asChild
          >
            <Link to="/shop">
              <ShoppingBag className="size-4" />
              Continue shopping
            </Link>
          </Button>
        </motion.div>
      </div>
    </div>
  )
}