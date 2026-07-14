import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeDollarSign,
  Mail,
  Phone,
  Search,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { TableSkeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/layouts/dashboard-layout'
import { ordersService } from '@/services/orders.service'
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from '@/lib/utils'
import type { Order } from '@/types'
import {
  ErrorState,
  OrderStatusBadge,
  useMerchant,
} from '../components/common'

interface CustomerRow {
  id: string
  name: string
  email: string
  phone: string
  orders: Order[]
  totalSpent: number
  lastOrderAt: number
}

export default function CustomersPage() {
  const { store } = useMerchant()

  const [search, setSearch] = React.useState('')
  const [selected, setSelected] =
    React.useState<CustomerRow | null>(null)

  const ordersQ = useQuery({
    queryKey: ['merchant-orders', store.id],
    queryFn: () => ordersService.listByStore(store.id),
  })

  const customers = React.useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>()

    for (const order of ordersQ.data ?? []) {
      const entry = map.get(order.customerId) ?? {
        id: order.customerId,
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
        orders: [],
        totalSpent: 0,
        lastOrderAt: 0,
      }

      entry.orders.push(order)

      if (order.status === 'completed') {
        entry.totalSpent += order.total
      }

      entry.lastOrderAt = Math.max(
        entry.lastOrderAt,
        order.createdAt,
      )

      map.set(order.customerId, entry)
    }

    return [...map.values()].sort(
      (a, b) => b.lastOrderAt - a.lastOrderAt,
    )
  }, [ordersQ.data])

  const visible = customers.filter((customer) => {
    const query = search.trim().toLowerCase()

    if (!query) return true

    return (
      customer.name.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query)
    )
  })

  if (ordersQ.isError) {
    return (
      <ErrorState
        onRetry={() => void ordersQ.refetch()}
      />
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Customers"
        description="Everyone who has ordered from your store."
        actions={
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search customers…"
              className="h-10 w-full pl-9"
            />
          </div>
        }
      />

      {ordersQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            search
              ? 'No matching customers'
              : 'No customers yet'
          }
          description={
            search
              ? 'Try a different search term.'
              : 'Customers appear here after their first order.'
          }
        />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
          <div className="max-h-[560px] overflow-auto">
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="min-w-[320px]">
                    Customer
                  </TableHead>

                  <TableHead className="min-w-[170px]">
                    Phone
                  </TableHead>

                  <TableHead className="min-w-[100px]">
                    Orders
                  </TableHead>

                  <TableHead className="min-w-[150px]">
                    Total spent
                  </TableHead>

                  <TableHead className="min-w-[160px]">
                    Last order
                  </TableHead>

                  <TableHead className="min-w-[130px] text-right" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {visible.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="transition-colors hover:bg-primary/[0.03]"
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={customer.name} />

                        <div className="min-w-0">
                          <p
                            className="max-w-[240px] truncate font-semibold"
                            title={customer.name}
                          >
                            {customer.name}
                          </p>

                          <p
                            className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground"
                            title={customer.email}
                          >
                            {customer.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {customer.phone}
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                        {formatNumber(
                          customer.orders.length,
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-semibold">
                      {formatCurrency(
                        customer.totalSpent,
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(customer.lastOrderAt)}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelected(customer)
                        }
                      >
                        View orders
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) =>
          !open && setSelected(null)
        }
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl p-0">
          <DialogHeader className="border-b p-4 text-left sm:p-6">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={selected?.name ?? ''} />

              <div className="min-w-0">
                <DialogTitle
                  className="truncate"
                  title={selected?.name}
                >
                  {selected?.name}
                </DialogTitle>

                <DialogDescription className="mt-1">
                  Customer order history and spending
                  overview.
                </DialogDescription>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" />

                <span
                  className="truncate text-sm text-muted-foreground"
                  title={selected?.email}
                >
                  {selected?.email}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" />

                <span
                  className="truncate text-sm text-muted-foreground"
                  title={selected?.phone}
                >
                  {selected?.phone}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <ShoppingBag className="size-4 shrink-0 text-muted-foreground" />

                <span className="text-sm text-muted-foreground">
                  {selected?.orders.length ?? 0} order
                  {selected?.orders.length === 1
                    ? ''
                    : 's'}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <BadgeDollarSign className="size-4 shrink-0 text-muted-foreground" />

                <span className="text-sm font-medium">
                  {formatCurrency(
                    selected?.totalSpent ?? 0,
                  )}{' '}
                  spent
                </span>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[420px] overflow-y-auto p-4 sm:p-6">
            <div className="space-y-3">
              {(selected?.orders ?? [])
                .slice()
                .sort(
                  (a, b) =>
                    b.createdAt - a.createdAt,
                )
                .map((order) => {
                  const itemCount = order.items.reduce(
                    (sum, item) =>
                      sum + item.quantity,
                    0,
                  )

                  return (
                    <Link
                      key={order.id}
                      to={`/merchant/orders/${order.id}`}
                      className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-semibold text-primary"
                          title={order.orderNumber}
                        >
                          {order.orderNumber}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(
                            order.createdAt,
                            'MMM D, YYYY h:mm A',
                          )}{' '}
                          · {itemCount} item
                          {itemCount === 1 ? '' : 's'}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                        <span className="whitespace-nowrap font-semibold">
                          {formatCurrency(order.total)}
                        </span>

                        <OrderStatusBadge
                          status={order.status}
                        />
                      </div>
                    </Link>
                  )
                })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}