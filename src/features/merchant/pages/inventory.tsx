import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { limit, orderBy, where } from 'firebase/firestore'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { PageHeader } from '@/layouts/dashboard-layout'
import { productsService } from '@/services/products.service'
import { queryDocs } from '@/services/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { formatNumber, getErrorMessage } from '@/lib/utils'
import type { InventoryLog, Product } from '@/types'
import { ErrorState, useMerchant } from '../components/common'
import { AdjustStockDialog } from '../components/inventory/adjust-stock-dialog'
import { InventoryFilterTabs } from '../components/inventory/inventory-filter-tabs'
import { InventoryLogSection } from '../components/inventory/inventory-log-section'
import { InventorySummaryCards } from '../components/inventory/inventory-summary-cards'
import { InventoryTable } from '../components/inventory/inventory-table'
import { InventoryToolbar } from '../components/inventory/inventory-toolbar'
import type { StockAdjustment, StockTab } from '../components/inventory/inventory.types'

export default function InventoryPage() {
  const { store } = useMerchant()
  const queryClient = useQueryClient()

  const [tab, setTab] = React.useState<StockTab>('all')
  const [adjusting, setAdjusting] = React.useState<Product | null>(null)
  const [search, setSearch] = React.useState('')

  const productsQ = useQuery({
    queryKey: ['merchant-products', store.id],
    queryFn: () => productsService.listByStore(store.id),
  })

  const logsQ = useQuery({
    queryKey: ['merchant-inventory-logs', store.id],
    queryFn: () =>
      queryDocs<InventoryLog>(
        COLLECTIONS.inventoryLogs,
        where('storeId', '==', store.id),
        orderBy('createdAt', 'desc'),
        limit(50),
      ),
  })

  const products = (productsQ.data ?? []).filter((product) => product.status !== 'archived')

  const searchTerm = search.trim().toLowerCase()

  const visible = products.filter((product) => {
    const threshold = product.lowStockThreshold ?? 5

    const matchesSearch =
      !searchTerm ||
      product.name.toLowerCase().includes(searchTerm) ||
      (product.sku ?? '').toLowerCase().includes(searchTerm)

    if (!matchesSearch) return false
    if (tab === 'low') {
      return product.stock > 0 && product.stock <= threshold
    }
    if (tab === 'out') return product.stock <= 0

    return true
  })

  const totalProducts = products.length

  const totalStock = products.reduce((sum, product) => sum + product.stock, 0)

  const lowStockCount = products.filter(
    (product) => product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5),
  ).length

  const outOfStockCount = products.filter((product) => product.stock <= 0).length

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['merchant-products', store.id],
    })

    await queryClient.invalidateQueries({
      queryKey: ['merchant-inventory-logs', store.id],
    })
  }

  const adjustStock = useMutation({
    mutationFn: (adjustment: StockAdjustment) =>
      productsService.adjustStock(
        adjustment.product.id,
        adjustment.change,
        adjustment.reason,
        adjustment.note,
        adjustment.variantId,
      ),
    onSuccess: async () => {
      toast.success('Stock updated')
      setAdjusting(null)
      await refresh()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const exportInventoryCsv = () => {
    const headers = ['Product', 'SKU', 'Stock', 'Low Stock Alert', 'Sold']

    const rows = products.map((product) => ({
      Product: product.name,
      SKU: product.sku ?? '',
      Stock: product.stock,
      'Low Stock Alert': product.lowStockThreshold ?? 5,
      Sold: product.soldCount,
    }))

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => `"${String(row[header as keyof typeof row]).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`

    link.click()
    URL.revokeObjectURL(url)
  }

  const exportInventoryPdf = () => {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    const generatedAt = new Date().toLocaleString()
    const reportTitle = `${store.name ?? 'Vendora'} — Inventory Report`

    pdf.setFontSize(18)
    pdf.setTextColor(17, 24, 39)
    pdf.text(reportTitle, 14, 16)

    pdf.setFontSize(10)
    pdf.setTextColor(107, 114, 128)
    pdf.text(`Generated: ${generatedAt}`, 14, 23)

    pdf.setTextColor(17, 24, 39)
    pdf.setFontSize(11)
    pdf.text(`Total products: ${formatNumber(totalProducts)}`, 14, 32)
    pdf.text(`Total stock: ${formatNumber(totalStock)}`, 78, 32)
    pdf.text(`Low stock: ${formatNumber(lowStockCount)}`, 142, 32)
    pdf.text(`Out of stock: ${formatNumber(outOfStockCount)}`, 206, 32)

    const tableRows = products.map((product) => {
      const threshold = product.lowStockThreshold ?? 5

      const status =
        product.stock <= 0 ? 'Out of stock' : product.stock <= threshold ? 'Low stock' : 'In stock'

      return [
        product.name,
        product.sku ?? '—',
        formatNumber(product.stock),
        status,
        formatNumber(threshold),
        formatNumber(product.soldCount ?? 0),
      ]
    })

    autoTable(pdf, {
      startY: 40,
      head: [['Product', 'SKU', 'Stock', 'Status', 'Low-stock alert', 'Sold']],
      body: tableRows,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        valign: 'middle',
      },
      headStyles: {
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: {
        left: 14,
        right: 14,
      },
      didDrawPage: (data) => {
        pdf.setFontSize(9)
        pdf.setTextColor(107, 114, 128)

        pdf.text(
          `Page ${data.pageNumber}`,
          pdf.internal.pageSize.getWidth() - 28,
          pdf.internal.pageSize.getHeight() - 8,
        )
      },
    })

    pdf.save(`inventory-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  if (productsQ.isError) {
    return <ErrorState onRetry={() => void productsQ.refetch()} />
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PageHeader title="Inventory" description="Track and adjust stock levels across your catalog." />

      <InventorySummaryCards
        totalProducts={totalProducts}
        totalStock={totalStock}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        activeTab={tab}
        onTabChange={setTab}
      />

      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        onExportCsv={exportInventoryCsv}
        onExportPdf={exportInventoryPdf}
      />

      <InventoryFilterTabs
        value={tab}
        totalCount={products.length}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        onValueChange={setTab}
      />

      <InventoryTable
        products={visible}
        totalProducts={products.length}
        isLoading={productsQ.isLoading}
        searchTerm={searchTerm}
        activeTab={tab}
        onAdjustStock={setAdjusting}
        onClearFilters={() => {
          setSearch('')
          setTab('all')
        }}
      />

      <InventoryLogSection
        logs={logsQ.data ?? []}
        isLoading={logsQ.isLoading}
        isError={logsQ.isError}
        onRetry={() => void logsQ.refetch()}
      />

      <AdjustStockDialog
        product={adjusting}
        isPending={adjustStock.isPending}
        onOpenChange={(open) => !open && setAdjusting(null)}
        onAdjust={(adjustment) => adjustStock.mutate(adjustment)}
      />
    </div>
  )
}
