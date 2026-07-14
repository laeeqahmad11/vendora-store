import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox, EmptyState } from '@/components/ui/misc'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/layouts/dashboard-layout'
import { productsService } from '@/services/products.service'
import {
  formatCurrency,
  formatNumber,
  getErrorMessage,
} from '@/lib/utils'
import type { Product, ProductStatus } from '@/types'
import {
  ErrorState,
  ProductStatusBadge,
  downloadCsv,
  parseCsv,
  useMerchant,
} from '../components/common'

const TAB_OPTIONS: {
  value: ProductStatus | 'all'
  label: string
}[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
]

function ImportDialog({
  open,
  onOpenChange,
  onImport,
  importing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImport: (text: string) => void
  importing: boolean
}) {
  const [text, setText] = React.useState('')

  const onFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]

    if (!file) return

    setText(await file.text())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>Import products from CSV</DialogTitle>

          <DialogDescription className="break-words">
            Columns:{' '}
            <code className="rounded bg-muted px-1">
              name,description,price,stock,categoryId
            </code>
            . Each row is created as a draft product.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="w-full"
          />

          <Textarea
            rows={8}
            placeholder={
              'name,description,price,stock,categoryId\n"Blue mug","Ceramic mug",12.5,40,cat123'
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-44 resize-y font-mono text-xs"
          />
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
            onClick={() => onImport(text)}
            loading={importing}
            disabled={!text.trim()}
          >
            Import drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProductsListPage() {
  const { store, actor } = useMerchant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [tab, setTab] =
    React.useState<ProductStatus | 'all'>('all')
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(),
  )
  const [deleteTarget, setDeleteTarget] =
    React.useState<Product | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] =
    React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)

  const productsQ = useQuery({
    queryKey: ['merchant-products', store.id],
    queryFn: () => productsService.listByStore(store.id),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['merchant-products', store.id],
    })

  const products = productsQ.data ?? []

  const visible = React.useMemo(() => {
    let items =
      tab === 'all'
        ? products
        : products.filter((product) => product.status === tab)

    const q = search.trim().toLowerCase()

    if (q) {
      items = items.filter(
        (product) =>
          product.name.toLowerCase().includes(q) ||
          product.sku?.toLowerCase().includes(q),
      )
    }

    return items
  }, [products, tab, search])

  const toggleSelect = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })

  const allVisibleSelected =
    visible.length > 0 &&
    visible.every((product) => selected.has(product.id))

  const toggleSelectAll = () =>
    setSelected(
      allVisibleSelected
        ? new Set()
        : new Set(visible.map((product) => product.id)),
    )

  const run = async (
    fn: () => Promise<unknown>,
    success: string,
  ) => {
    try {
      await fn()
      toast.success(success)
      setSelected(new Set())
      await invalidate()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const duplicate = (product: Product) => {
    const {
      id: _id,
      slug: _slug,
      rating: _rating,
      ratingCount: _ratingCount,
      soldCount: _soldCount,
      viewCount: _viewCount,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      publishedAt: _publishedAt,
      rejectionReason: _rejectionReason,
      ...rest
    } = product

    return run(
      () =>
        productsService.create({
          ...rest,
          name: `${product.name} (copy)`,
          status: 'draft',
          flashSale: null,
          featured: false,
          trending: false,
          recommended: false,
        }),
      'Product duplicated as draft',
    )
  }

  const importMutation = useMutation({
    mutationFn: async (text: string) => {
      const rows = parseCsv(text)

      if (rows.length < 2) {
        throw new Error(
          'CSV must contain a header row and at least one data row.',
        )
      }

      const header = rows[0].map((value) =>
        value.trim().toLowerCase(),
      )

      const idx = (name: string) => header.indexOf(name)

      for (const column of ['name', 'price']) {
        if (idx(column) === -1) {
          throw new Error(
            `Missing required column "${column}".`,
          )
        }
      }

      let created = 0

      for (const row of rows.slice(1)) {
        const name = row[idx('name')]?.trim()

        if (!name) continue

        const price = Number(row[idx('price')] ?? 0)

        const stock =
          idx('stock') >= 0
            ? Number(row[idx('stock')] ?? 0)
            : 0

        await productsService.create({
          storeId: store.id,
          merchantId: actor.id,
          name,
          description:
            idx('description') >= 0
              ? (row[idx('description')] ?? '')
              : '',
          images: [],
          price: Number.isFinite(price) ? price : 0,
          currency: 'USD',
          stock: Number.isFinite(stock)
            ? Math.round(stock)
            : 0,
          categoryId:
            idx('categoryid') >= 0
              ? (row[idx('categoryid')] ?? '').trim()
              : '',
          tags: [],
          status: 'draft',
        })

        created++
      }

      return created
    },

    onSuccess: async (created) => {
      toast.success(
        `Imported ${created} draft product${
          created === 1 ? '' : 's'
        }.`,
      )

      setImportOpen(false)
      await invalidate()
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  const exportCsv = () => {
    downloadCsv(
      `products-${store.slug}.csv`,
      [
        'name',
        'description',
        'price',
        'stock',
        'categoryId',
        'sku',
        'status',
        'soldCount',
      ],
      visible.map((product) => [
        product.name,
        product.description,
        product.price,
        product.stock,
        product.categoryId,
        product.sku ?? '',
        product.status,
        product.soldCount,
      ]),
    )

    toast.success(`Exported ${visible.length} products.`)
  }

  const bulk = async (
    action: 'archive' | 'submit',
  ) => {
    const ids = [...selected]

    await run(
      () =>
        Promise.all(
          ids.map((id) =>
            action === 'archive'
              ? productsService.update(id, {
                  status: 'archived',
                })
              : productsService.submitForReview(id),
          ),
        ),
      action === 'archive'
        ? `Archived ${ids.length} products`
        : `Submitted ${ids.length} products for review`,
    )
  }

  if (productsQ.isError) {
    return (
      <ErrorState
        onRetry={() => void productsQ.refetch()}
      />
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Products"
        description="Manage your catalog, stock and product approvals."
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-4" />
              Import
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={exportCsv}
              disabled={visible.length === 0}
            >
              <Download className="size-4" />
              Export
            </Button>

            <Button
              asChild
              size="sm"
              className="w-full sm:w-auto"
            >
              <Link to="/merchant/products/new">
                <Plus className="size-4" />
                Add product
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
          <Tabs
            value={tab}
            onValueChange={(value) =>
              setTab(value as ProductStatus | 'all')
            }
            className="w-max min-w-full"
          >
            <TabsList className="inline-flex h-auto min-w-max">
              {TAB_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="relative w-full shrink-0 lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search by name or SKU…"
            className="h-10 w-full pl-9"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="whitespace-nowrap text-sm font-semibold">
              {selected.size} selected
            </p>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:hidden"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => void bulk('submit')}
            >
              <Send className="size-4" />
              Submit for review
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => void bulk('archive')}
            >
              <Archive className="size-4" />
              Archive
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {productsQ.isLoading ? (
        <TableSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            search
              ? 'No matching products'
              : 'No products yet'
          }
          description={
            search
              ? 'Try a different search term or switch tabs.'
              : 'Create your first product to start selling on Vendora.'
          }
          action={
            !search && (
              <Button asChild>
                <Link to="/merchant/products/new">
                  <Plus className="size-4" />
                  Add product
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
          <div className="max-h-[560px] overflow-auto">
            <Table className="min-w-[920px]">
              <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-12 min-w-12">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>

                  <TableHead className="min-w-[330px]">
                    Product
                  </TableHead>

                  <TableHead className="min-w-[130px]">
                    Price
                  </TableHead>

                  <TableHead className="min-w-[130px]">
                    Stock
                  </TableHead>

                  <TableHead className="min-w-[150px]">
                    Status
                  </TableHead>

                  <TableHead className="min-w-[90px]">
                    Sold
                  </TableHead>

                  <TableHead className="w-14 min-w-14" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {visible.map((product) => {
                  const low =
                    product.stock > 0 &&
                    product.stock <=
                      (product.lowStockThreshold ?? 5)

                  return (
                    <TableRow
                      key={product.id}
                      className="transition-colors hover:bg-primary/[0.03]"
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(product.id)}
                          onCheckedChange={() =>
                            toggleSelect(product.id)
                          }
                          aria-label={`Select ${product.name}`}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          {product.images[0] ? (
                            <img
                              src={product.images[0]}
                              alt=""
                              className="size-11 shrink-0 rounded-lg border object-cover"
                            />
                          ) : (
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                              <Package className="size-4 text-muted-foreground" />
                            </span>
                          )}

                          <div className="min-w-0">
                            <Link
                              to={`/merchant/products/${product.id}/edit`}
                              className="block max-w-[280px] truncate font-semibold transition-colors hover:text-primary"
                              title={product.name}
                            >
                              {product.name}
                            </Link>

                            {product.sku && (
                              <p
                                className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground"
                                title={`SKU ${product.sku}`}
                              >
                                SKU {product.sku}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-semibold">
                        {formatCurrency(
                          product.price,
                          product.currency,
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {formatNumber(product.stock)}
                          </span>

                          {product.stock <= 0 ? (
                            <span className="inline-flex whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                              Out
                            </span>
                          ) : low ? (
                            <span className="inline-flex whitespace-nowrap rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                              Low
                            </span>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <ProductStatusBadge
                          status={product.status}
                        />

                        {product.status === 'rejected' &&
                          product.rejectionReason && (
                            <p
                              className="mt-1 max-w-[220px] truncate text-xs text-destructive"
                              title={product.rejectionReason}
                            >
                              {product.rejectionReason}
                            </p>
                          )}
                      </TableCell>

                      <TableCell className="font-medium">
                        {formatNumber(product.soldCount)}
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Product actions"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(
                                  `/merchant/products/${product.id}/edit`,
                                )
                              }
                            >
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() =>
                                void duplicate(product)
                              }
                            >
                              <Copy className="size-4" />
                              Duplicate
                            </DropdownMenuItem>

                            {(product.status === 'draft' ||
                              product.status ===
                                'rejected') && (
                              <DropdownMenuItem
                                onClick={() =>
                                  void run(
                                    () =>
                                      productsService.submitForReview(
                                        product.id,
                                      ),
                                    'Submitted for review',
                                  )
                                }
                              >
                                <Send className="size-4" />
                                Submit for review
                              </DropdownMenuItem>
                            )}

                            {product.status === 'archived' ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  void run(
                                    () =>
                                      productsService.update(
                                        product.id,
                                        {
                                          status: 'draft',
                                        },
                                      ),
                                    'Product unarchived',
                                  )
                                }
                              >
                                <ArchiveRestore className="size-4" />
                                Unarchive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  void run(
                                    () =>
                                      productsService.update(
                                        product.id,
                                        {
                                          status:
                                            'archived',
                                        },
                                      ),
                                    'Product archived',
                                  )
                                }
                              >
                                <Archive className="size-4" />
                                Archive
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                setDeleteTarget(product)
                              }
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) =>
          !open && setDeleteTarget(null)
        }
        title="Delete product?"
        description={`"${deleteTarget?.name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return

          await run(
            () =>
              productsService.remove(deleteTarget.id),
            'Product deleted',
          )

          setDeleteTarget(null)
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} products?`}
        description="All selected products will be permanently deleted. This cannot be undone."
        confirmLabel="Delete all"
        destructive
        onConfirm={async () => {
          const ids = [...selected]

          await run(
            () =>
              Promise.all(
                ids.map((id) =>
                  productsService.remove(id),
                ),
              ),
            `Deleted ${ids.length} products`,
          )
        }}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(text) =>
          importMutation.mutate(text)
        }
        importing={importMutation.isPending}
      />
    </div>
  )
}