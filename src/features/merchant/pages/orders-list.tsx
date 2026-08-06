import { TableSkeleton } from '@/components/ui/skeleton'
import { LiveBadge } from '@/components/shared/live-badge'
import { PageHeader } from '@/layouts/dashboard-layout'
import {
  ErrorState,
  useMerchant,
} from '../components/common'
import { OrdersEmptyState } from '../components/orders/orders-empty-state'
import { OrdersMobileList } from '../components/orders/orders-mobile-list'
import { OrdersSummaryCards } from '../components/orders/orders-summary-cards'
import { OrdersTable } from '../components/orders/orders-table'
import { OrdersToolbar } from '../components/orders/orders-toolbar'
import { useOrders } from '../components/orders/use-orders'

export default function OrdersListPage() {
  const { store } = useMerchant()
  const {
    ordersQ,
    orders,
    tab,
    setTab,
    search,
    setSearch,
    summaryCounts,
    visible,
    getTabCount,
    openOrder,
    clearFilters,
  } = useOrders(store.id)

  if (ordersQ.isError) {
    return (
      <ErrorState
        onRetry={() =>
          window.location.reload()
        }
      />
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Orders"
        description="Track and fulfil your customer orders."
        actions={<LiveBadge />}
      />

      <OrdersSummaryCards
        isLoading={ordersQ.isLoading}
        totalOrders={orders.length}
        counts={summaryCounts}
        activeTab={tab}
        onTabChange={setTab}
      />

      <OrdersToolbar
        tab={tab}
        search={search}
        getTabCount={getTabCount}
        onTabChange={setTab}
        onSearchChange={setSearch}
      />

      {ordersQ.isLoading ? (
        <TableSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <OrdersEmptyState
          search={search}
          tab={tab}
          onClearFilters={clearFilters}
        />
      ) : (
        <>
          <OrdersTable
            orders={visible}
            onOpenOrder={openOrder}
          />

          <OrdersMobileList orders={visible} />
        </>
      )}

      {!ordersQ.isLoading &&
        visible.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing {visible.length} of{' '}
            {orders.length}{' '}
            {orders.length === 1
              ? 'order'
              : 'orders'}
          </p>
        )}
    </div>
  )
}
