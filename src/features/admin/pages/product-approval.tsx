import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { orderBy, where } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { Archive, Package, Search } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState, Switch } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { productsService } from '@/services/products.service'
import { storesService } from '@/services/stores.service'
import { catalogService } from '@/services/catalog.service'
import { activityService } from '@/services/activity.service'
import { notificationsService } from '@/services/notifications.service'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import { COLLECTIONS } from '@/lib/constants'
import { formatCurrency, formatDate, getErrorMessage, timeAgo } from '@/lib/utils'
import type { Product } from '@/types'
import { useAdminActor } from '../components/hooks'

export default function ProductApprovalPage() {
  const storesQ = useQuery({ queryKey: ['admin-stores'], queryFn: () => storesService.listAll() })
  const categoriesQ = useQuery({ queryKey: ['admin-categories'], queryFn: () => catalogService.listCategories() })

  const storeName = React.useCallback(
    (id: string) => storesQ.data?.find((s) => s.id === id)?.name ?? '—',
    [storesQ.data],
  )
  const categoryName = React.useCallback(
    (id: string) => categoriesQ.data?.find((c) => c.id === id)?.name ?? '—',
    [categoriesQ.data],
  )

  // Live subscription — the approval queue grows in real time as merchants
  // submit products for review
  const pendingQ = useRealtimeCollection<Product>(
    COLLECTIONS.products,
    [where('status', '==', 'pending'), orderBy('updatedAt', 'asc')],
    [],
  )

  return (
    <div>
      <PageHeader
        title="Products"
        description="Approve merchant listings and curate the public catalog."
        actions={<LiveBadge />}
      />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Approval queue
            {(pendingQ.data?.length ?? 0) > 0 && (
              <Badge variant="warning" className="ml-1.5">
                {pendingQ.data?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All products</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <PendingQueue storeName={storeName} categoryName={categoryName} />
        </TabsContent>
        <TabsContent value="all">
          <AllProducts storeName={storeName} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function useProductReviewMutation(onDone?: () => void) {
  const actor = useAdminActor()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      product,
      status,
      reason,
    }: {
      product: Product
      status: 'approved' | 'rejected' | 'archived'
      reason?: string
    }) => {
      await productsService.setStatus(product.id, status, reason)
      await activityService.log(actor, `product.${status}`, 'product', product.id, product.name)
      await notificationsService.notify(product.merchantId, {
        type: 'approval',
        title: `Product ${status}`,
        body: `"${product.name}" was ${status}.${reason ? ` Reason: ${reason}` : ''}`,
        linkUrl: '/merchant/products',
      })
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['admin-products-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-products-approved'] })
      toast.success(`Product ${v.status}`)
      onDone?.()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
}

function PendingQueue({
  storeName,
  categoryName,
}: {
  storeName: (id: string) => string
  categoryName: (id: string) => string
}) {
  const [selected, setSelected] = React.useState<Product | null>(null)
  // Live queue — new submissions appear (and reviewed items disappear) instantly
  const pendingQ = useRealtimeCollection<Product>(
    COLLECTIONS.products,
    [where('status', '==', 'pending'), orderBy('updatedAt', 'asc')],
    [],
  )

  if (pendingQ.isLoading) return <TableSkeleton rows={6} />
  const items = pendingQ.data ?? []
  if (items.length === 0) {
    return <EmptyState icon={Package} title="Queue is clear" description="No products are waiting for review." />
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelected(p)}>
              <TableCell>
                <span className="flex items-center gap-3">
                  <ProductThumb product={p} />
                  <span className="font-medium">{p.name}</span>
                </span>
              </TableCell>
              <TableCell>{storeName(p.storeId)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatCurrency(p.price, p.currency || 'USD')}</TableCell>
              <TableCell>{categoryName(p.categoryId)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(p.updatedAt)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(p)
                  }}
                >
                  Review
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selected && (
        <ProductReviewDialog
          product={selected}
          storeName={storeName}
          categoryName={categoryName}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

function ProductThumb({ product }: { product: Product }) {
  return product.images[0] ? (
    <img src={product.images[0]} alt={product.name} className="size-10 shrink-0 rounded-lg border object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
      <Package className="size-4 text-muted-foreground" />
    </span>
  )
}

function ProductReviewDialog({
  product,
  storeName,
  categoryName,
  onClose,
}: {
  product: Product
  storeName: (id: string) => string
  categoryName: (id: string) => string
  onClose: () => void
}) {
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const reviewMut = useProductReviewMutation(onClose)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            {storeName(product.storeId)} · {categoryName(product.categoryId)} · submitted{' '}
            {formatDate(product.updatedAt, 'MMM D, YYYY h:mm A')}
          </DialogDescription>
        </DialogHeader>

        {product.images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {product.images.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={product.name} className="aspect-square w-full rounded-lg border object-cover" />
              </a>
            ))}
          </div>
        )}

        <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Price:</span>{' '}
            <span className="font-semibold">{formatCurrency(product.price, product.currency || 'USD')}</span>
            {product.compareAtPrice ? (
              <span className="ml-2 text-muted-foreground line-through">
                {formatCurrency(product.compareAtPrice, product.currency || 'USD')}
              </span>
            ) : null}
          </p>
          <p>
            <span className="text-muted-foreground">Stock:</span> {product.stock}
          </p>
          {product.sku && (
            <p>
              <span className="text-muted-foreground">SKU:</span> {product.sku}
            </p>
          )}
          {product.brandId && (
            <p>
              <span className="text-muted-foreground">Brand ID:</span> {product.brandId}
            </p>
          )}
          {product.tags.length > 0 && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Tags:</span> {product.tags.join(', ')}
            </p>
          )}
        </div>

        <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
          {product.description || 'No description provided.'}
        </div>

        {product.specifications && product.specifications.length > 0 && (
          <div className="space-y-1 text-sm">
            {product.specifications.map((spec) => (
              <p key={spec.label}>
                <span className="text-muted-foreground">{spec.label}:</span> {spec.value}
              </p>
            ))}
          </div>
        )}

        {rejecting ? (
          <>
            <FormField label="Rejection reason" required>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain what the merchant should fix…"
              />
            </FormField>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejecting(false)}>
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={!reason.trim()}
                loading={reviewMut.isPending}
                onClick={() => reviewMut.mutate({ product, status: 'rejected', reason: reason.trim() })}
              >
                Reject product
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogFooter>
            <Button variant="destructive" onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <Button
              variant="success"
              loading={reviewMut.isPending}
              onClick={() => reviewMut.mutate({ product, status: 'approved' })}
            >
              Approve
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

const FLAGS = ['featured', 'trending', 'recommended'] as const

function AllProducts({ storeName }: { storeName: (id: string) => string }) {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [archiving, setArchiving] = React.useState<Product | null>(null)
  const [archiveReason, setArchiveReason] = React.useState('')

  const productsQ = useQuery({
    queryKey: ['admin-products-approved'],
    queryFn: () => productsService.listForSearch(1000),
  })

  const flagMut = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: (typeof FLAGS)[number]; value: boolean }) =>
      productsService.update(id, { [field]: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products-approved'] })
      toast.success('Product updated')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const archiveMut = useProductReviewMutation(() => {
    setArchiving(null)
    setArchiveReason('')
  })

  if (productsQ.isLoading) return <TableSkeleton rows={8} />

  const items = (productsQ.data ?? []).filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="pl-9"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Package} title="No products found" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Trending</TableHead>
              <TableHead>Recommended</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <ProductThumb product={p} />
                    <span className="max-w-56 truncate font-medium">{p.name}</span>
                  </span>
                </TableCell>
                <TableCell>{storeName(p.storeId)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatCurrency(p.price, p.currency || 'USD')}</TableCell>
                {FLAGS.map((field) => (
                  <TableCell key={field}>
                    <Switch
                      checked={!!p[field]}
                      onCheckedChange={(value) => flagMut.mutate({ id: p.id, field, value })}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setArchiving(p)}>
                    <Archive className="size-4" /> Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!archiving} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove "{archiving?.name}" from sale?</DialogTitle>
            <DialogDescription>
              The product is archived and hidden from the marketplace. The merchant is notified with your reason.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Reason" required>
            <Textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="e.g. Violates marketplace listing policy…"
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!archiveReason.trim()}
              loading={archiveMut.isPending}
              onClick={() =>
                archiving && archiveMut.mutate({ product: archiving, status: 'archived', reason: archiveReason.trim() })
              }
            >
              Remove from sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
