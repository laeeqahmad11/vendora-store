import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { limit, orderBy, where } from 'firebase/firestore'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Download,
  FileText,
  History,
  Minus,
  Package,
  Plus,
  Search,
  Warehouse,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { TableSkeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import { PageHeader } from '@/layouts/dashboard-layout'
import { productsService } from '@/services/products.service'
import { createDocument, queryDocs } from '@/services/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { formatNumber, getErrorMessage, timeAgo } from '@/lib/utils'
import type { InventoryLog, Product } from '@/types'
import { ErrorState, useMerchant } from '../components/common'

type StockTab = 'all' | 'low' | 'out'
type AdjustReason = 'restock' | 'adjustment' | 'return'

async function adjustStockWithLog(
  product: Product,
  change: number,
  reason: AdjustReason,
  note: string,
  actorId: string,
) {
  await productsService.adjustStock(product.id, change)

  await createDocument<InventoryLog>(COLLECTIONS.inventoryLogs, {
    storeId: product.storeId,
    productId: product.id,
    productName: product.name,
    change,
    reason,
    note: note || undefined,
    by: actorId,
  } as Omit<InventoryLog, 'id' | 'createdAt'>)
}

function AdjustDialog({
  product,
  onOpenChange,
  onDone,
}: {
  product: Product | null
  onOpenChange: (o: boolean) => void
  onDone: () => Promise<unknown>
}) {
  const { actor } = useMerchant()
  const [direction, setDirection] = React.useState<'add' | 'remove'>('add')
  const [quantity, setQuantity] = React.useState('1')
  const [reason, setReason] = React.useState<AdjustReason>('restock')
  const [note, setNote] = React.useState('')

  React.useEffect(() => {
    if (product) {
      setDirection('add')
      setQuantity('1')
      setReason('restock')
      setNote('')
    }
  }, [product])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product) return

      const qty = Math.abs(Math.round(Number(quantity)))

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Enter a valid quantity.')
      }

      const change = direction === 'remove' ? -qty : qty

      if (product.stock + change < 0) {
        throw new Error('Stock cannot go below zero.')
      }

      await adjustStockWithLog(
        product,
        change,
        reason,
        note.trim(),
        actor.id,
      )
    },
    onSuccess: async () => {
      toast.success('Stock updated')
      onOpenChange(false)
      await onDone()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>Adjust stock</DialogTitle>

          <DialogDescription className="break-words">
            {product?.name} — current stock:{' '}
            {product ? formatNumber(product.stock) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-2">
            <Button
              type="button"
              className="w-full"
              variant={direction === 'add' ? 'default' : 'outline'}
              onClick={() => setDirection('add')}
            >
              <Plus className="size-4" />
              Add stock
            </Button>

            <Button
              type="button"
              className="w-full"
              variant={direction === 'remove' ? 'default' : 'outline'}
              onClick={() => setDirection('remove')}
            >
              <Minus className="size-4" />
              Remove stock
            </Button>
          </div>

          <FormField label="Quantity" required>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </FormField>

          <FormField label="Reason" required>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as AdjustReason)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="restock">Restock</SelectItem>
                <SelectItem value="adjustment">
                  Adjustment / correction
                </SelectItem>
                <SelectItem value="return">Customer return</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Note">
            <Textarea
              rows={2}
              placeholder="Optional note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            className="w-full sm:w-auto"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Apply adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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

  const products = (productsQ.data ?? []).filter(
    (p) => p.status !== 'archived',
  )

  const searchTerm = search.trim().toLowerCase()

  const visible = products.filter((p) => {
    const threshold = p.lowStockThreshold ?? 5

    const matchesSearch =
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm) ||
      (p.sku ?? '').toLowerCase().includes(searchTerm)

    if (!matchesSearch) return false
    if (tab === 'low') return p.stock > 0 && p.stock <= threshold
    if (tab === 'out') return p.stock <= 0

    return true
  })

  const totalProducts = products.length

  const totalStock = products.reduce(
    (sum, product) => sum + product.stock,
    0,
  )

  const lowStockCount = products.filter(
    (product) =>
      product.stock > 0 &&
      product.stock <= (product.lowStockThreshold ?? 5),
  ).length

  const outOfStockCount = products.filter(
    (product) => product.stock <= 0,
  ).length

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['merchant-products', store.id],
    })

    await queryClient.invalidateQueries({
      queryKey: ['merchant-inventory-logs', store.id],
    })
  }

  const exportInventoryCsv = () => {
    const headers = [
      'Product',
      'SKU',
      'Stock',
      'Low Stock Alert',
      'Sold',
    ]

    const rows = products.map((p) => ({
      Product: p.name,
      SKU: p.sku ?? '',
      Stock: p.stock,
      'Low Stock Alert': p.lowStockThreshold ?? 5,
      Sold: p.soldCount,
    }))

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map(
            (header) =>
              `"${String(
                row[header as keyof typeof row],
              ).replace(/"/g, '""')}"`,
          )
          .join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `inventory-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`

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
    pdf.text(
      `Out of stock: ${formatNumber(outOfStockCount)}`,
      206,
      32,
    )

    const tableRows = products.map((product) => {
      const threshold = product.lowStockThreshold ?? 5

      const status =
        product.stock <= 0
          ? 'Out of stock'
          : product.stock <= threshold
            ? 'Low stock'
            : 'In stock'

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
      head: [
        [
          'Product',
          'SKU',
          'Stock',
          'Status',
          'Low-stock alert',
          'Sold',
        ],
      ],
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

    pdf.save(
      `inventory-${new Date().toISOString().slice(0, 10)}.pdf`,
    )
  }

  if (productsQ.isError) {
    return <ErrorState onRetry={() => void productsQ.refetch()} />
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        title="Inventory"
        description="Track and adjust stock levels across your catalog."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setTab('all')}
          className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Card
            className={
              tab === 'all'
                ? 'h-full border-primary/40 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                : 'h-full transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
            }
          >
            <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  Total products
                </p>

                <p className="mt-1 truncate text-xl font-bold sm:text-2xl">
                  {formatNumber(totalProducts)}
                </p>
              </div>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-11 sm:rounded-xl">
                <Package className="size-4 sm:size-5" />
              </div>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setTab('all')}
          className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Card
            className={
              tab === 'all'
                ? 'h-full border-primary/40 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                : 'h-full transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
            }
          >
            <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  Total stock
                </p>

                <p className="mt-1 truncate text-xl font-bold sm:text-2xl">
                  {formatNumber(totalStock)}
                </p>
              </div>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-11 sm:rounded-xl">
                <Boxes className="size-4 sm:size-5" />
              </div>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setTab('low')}
          className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
        >
          <Card
            className={
              tab === 'low'
                ? 'h-full border-warning/50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                : 'h-full transition hover:-translate-y-0.5 hover:border-warning/40 hover:shadow-md'
            }
          >
            <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  Low stock
                </p>

                <p className="mt-1 truncate text-xl font-bold text-warning sm:text-2xl">
                  {formatNumber(lowStockCount)}
                </p>
              </div>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning sm:size-11 sm:rounded-xl">
                <AlertTriangle className="size-4 sm:size-5" />
              </div>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setTab('out')}
          className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
        >
          <Card
            className={
              tab === 'out'
                ? 'h-full border-destructive/50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                : 'h-full transition hover:-translate-y-0.5 hover:border-destructive/40 hover:shadow-md'
            }
          >
            <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  Out of stock
                </p>

                <p className="mt-1 truncate text-xl font-bold text-destructive sm:text-2xl">
                  {formatNumber(outOfStockCount)}
                </p>
              </div>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive sm:size-11 sm:rounded-xl">
                <XCircle className="size-4 sm:size-5" />
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center sm:w-auto"
            >
              <Download className="size-4" />
              Export
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-44"
          >
            <DropdownMenuItem onClick={exportInventoryCsv}>
              <Download className="size-4" />
              Export CSV
            </DropdownMenuItem>

            <DropdownMenuItem onClick={exportInventoryPdf}>
              <FileText className="size-4" />
              Export PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name or SKU..."
            className="w-full pl-9"
          />
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as StockTab)}
          className="w-max min-w-full"
        >
          <TabsList className="inline-flex h-auto min-w-max">
            <TabsTrigger
              value="all"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              All ({products.length})
            </TabsTrigger>

            <TabsTrigger
              value="low"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Low stock (
              {
                products.filter(
                  (p) =>
                    p.stock > 0 &&
                    p.stock <= (p.lowStockThreshold ?? 5),
                ).length
              }
              )
            </TabsTrigger>

            <TabsTrigger
              value="out"
              className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
            >
              Out of stock (
              {products.filter((p) => p.stock <= 0).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {productsQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title={
            searchTerm
              ? 'No matching products'
              : tab === 'all'
                ? 'No products to track'
                : tab === 'low'
                  ? 'No low-stock products'
                  : 'Nothing out of stock'
          }
          description={
            searchTerm
              ? 'Try another product name or SKU.'
              : tab === 'all'
                ? 'Add products to start tracking inventory.'
                : 'You are all set here.'
          }
          action={
            tab === 'all' &&
            !searchTerm && (
              <Button asChild>
                <Link to="/merchant/products/new">Add product</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
          <div className="max-h-[520px] overflow-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                <TableRow>
                  <TableHead className="min-w-[240px]">
                    Product
                  </TableHead>
                  <TableHead className="min-w-[120px]">
                    SKU
                  </TableHead>
                  <TableHead className="min-w-[150px]">
                    Stock
                  </TableHead>
                  <TableHead className="min-w-[120px]">
                    Status
                  </TableHead>
                  <TableHead className="min-w-[130px]">
                    Low-stock alert
                  </TableHead>
                  <TableHead className="min-w-[80px]">
                    Sold
                  </TableHead>
                  <TableHead className="min-w-[100px] text-right">
                    Adjust
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {visible.map((p) => {
                  const threshold = p.lowStockThreshold ?? 5
                  const isOutOfStock = p.stock <= 0

                  const isLowStock =
                    p.stock > 0 && p.stock <= threshold

                  const statusLabel = isOutOfStock
                    ? 'Out of stock'
                    : isLowStock
                      ? 'Low stock'
                      : 'In stock'

                  const progressMax = Math.max(
                    threshold * 4,
                    p.stock,
                    1,
                  )

                  const stockProgress = Math.min(
                    100,
                    Math.max(
                      0,
                      (p.stock / progressMax) * 100,
                    ),
                  )

                  return (
                    <TableRow
                      key={p.id}
                      className="transition-colors hover:bg-primary/[0.03]"
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          {p.images[0] ? (
                            <img
                              src={p.images[0]}
                              alt=""
                              className="size-9 shrink-0 rounded-lg border object-cover"
                            />
                          ) : (
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                              <Package className="size-4 text-muted-foreground" />
                            </span>
                          )}

                          <span
                            className="max-w-[260px] truncate font-medium"
                            title={p.name}
                          >
                            {p.name}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        <span
                          className="block max-w-[140px] truncate"
                          title={p.sku ?? ''}
                        >
                          {p.sku ?? '—'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="min-w-[120px] space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={
                                isOutOfStock
                                  ? 'font-semibold text-destructive'
                                  : isLowStock
                                    ? 'font-semibold text-warning'
                                    : 'font-medium'
                              }
                            >
                              {formatNumber(p.stock)}
                            </span>

                            <span className="text-xs text-muted-foreground">
                              units
                            </span>
                          </div>

                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={
                                isOutOfStock
                                  ? 'h-full rounded-full bg-destructive transition-all'
                                  : isLowStock
                                    ? 'h-full rounded-full bg-warning transition-all'
                                    : 'h-full rounded-full bg-success transition-all'
                              }
                              style={{
                                width: `${stockProgress}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span
                          className={
                            isOutOfStock
                              ? 'inline-flex whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive'
                              : isLowStock
                                ? 'inline-flex whitespace-nowrap rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning'
                                : 'inline-flex whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success'
                          }
                        >
                          {statusLabel}
                        </span>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {threshold}
                      </TableCell>

                      <TableCell>
                        {formatNumber(p.soldCount)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAdjusting(p)}
                        >
                          Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Card className="min-w-0 overflow-hidden">
  <CardHeader className="border-b p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 shrink-0" />
            Inventory log
          </CardTitle>

          <CardDescription>
            The 50 most recent stock movements.
          </CardDescription>
        </CardHeader>

        <CardContent className="max-h-[460px] overflow-y-auto p-4 sm:p-6">
          {logsQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : logsQ.isError ? (
            <ErrorState onRetry={() => void logsQ.refetch()} />
          ) : (logsQ.data ?? []).length === 0 ? (
            <EmptyState
              icon={History}
              title="No stock movements yet"
              description="Adjustments will appear here."
              className="py-8"
            />
          ) : (
            <div className="space-y-3">
              {(logsQ.data ?? []).map((log) => {
                const isPositive = log.change >= 0

                const reasonLabel =
                  log.reason === 'restock'
                    ? 'Restock'
                    : log.reason === 'return'
                      ? 'Customer return'
                      : 'Adjustment'

                return (
                  <div
                    key={log.id}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:p-4"
                  >
                    <div className="flex min-w-0 gap-3 sm:gap-4">
                      <div
                        className={
                          isPositive
                            ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 font-bold text-success sm:size-10'
                            : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 font-bold text-destructive sm:size-10'
                        }
                      >
                        {isPositive ? '+' : '−'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-semibold"
                          title={log.productName}
                        >
                          {log.productName}
                        </p>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {reasonLabel}
                          </span>

                          <span className="text-xs text-muted-foreground">
                            By merchant
                          </span>
                        </div>

                        {log.note && (
                          <p className="mt-2 break-words text-sm text-muted-foreground">
                            {log.note}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between border-t pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
                      <p
                        className={
                          isPositive
                            ? 'font-bold text-success'
                            : 'font-bold text-destructive'
                        }
                      >
                        {isPositive
                          ? `+${log.change}`
                          : log.change}
                      </p>

                      <p className="whitespace-nowrap text-xs text-muted-foreground sm:mt-1">
                        {timeAgo(log.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AdjustDialog
        product={adjusting}
        onOpenChange={(o) => !o && setAdjusting(null)}
        onDone={refresh}
      />
    </div>
  )
}