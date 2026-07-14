import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { orderBy } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BadgeCheck, ExternalLink, FileText, Store as StoreIcon } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Avatar, EmptyState, Separator, Switch } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { storesService } from '@/services/stores.service'
import { usersService } from '@/services/users.service'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import { COLLECTIONS, STORE_STATUS_COLORS, STORE_STATUS_LABELS } from '@/lib/constants'
import { cn, formatDate, getErrorMessage } from '@/lib/utils'
import type { Store, StoreStatus } from '@/types'
import { useAdminActor } from '../components/hooks'

const TABS: { value: StoreStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'all', label: 'All' },
]

export default function MerchantsPage() {
  const [selected, setSelected] = React.useState<Store | null>(null)
  // Live subscription — new store applications appear the moment they're submitted
  const storesQ = useRealtimeCollection<Store>(COLLECTIONS.stores, [orderBy('createdAt', 'desc')], [])
  const stores = storesQ.data ?? []
  const pendingCount = stores.filter((s) => s.status === 'pending').length

  return (
    <div>
      <PageHeader
        title="Merchants"
        description="Review store applications and manage merchant stores."
        actions={<LiveBadge />}
      />

      <Tabs defaultValue="pending">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {tab.value === 'pending' && pendingCount > 0 && (
                <Badge variant="warning" className="ml-1.5">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => {
          const rows = tab.value === 'all' ? stores : stores.filter((s) => s.status === tab.value)
          return (
            <TabsContent key={tab.value} value={tab.value}>
              {storesQ.isLoading ? (
                <TableSkeleton rows={6} />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={StoreIcon}
                  title="No stores here"
                  description={tab.value === 'pending' ? 'New merchant applications will appear here.' : undefined}
                />
              ) : (
                <StoresTable stores={rows} onSelect={setSelected} />
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      {selected && <StoreDetailDialog store={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StoresTable({ stores, onSelect }: { stores: Store[]; onSelect: (s: Store) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Store</TableHead>
          <TableHead>Owner Email</TableHead>
          <TableHead>Business Name</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {stores.map((store) => (
          <TableRow key={store.id} className="cursor-pointer" onClick={() => onSelect(store)}>
            <TableCell>
              <span className="flex items-center gap-3">
                <Avatar src={store.logoUrl} name={store.name} />
                <span className="font-medium">
                  {store.name}
                  {store.verified && <BadgeCheck className="ml-1 inline size-4 text-primary" aria-label="Verified" />}
                </span>
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">{store.email}</TableCell>
            <TableCell>{store.businessName || '—'}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(store.createdAt)}</TableCell>
            <TableCell>
              <span
                className={cn(
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                  STORE_STATUS_COLORS[store.status],
                )}
              >
                {STORE_STATUS_LABELS[store.status]}
              </span>
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(store)
                }}
              >
                Review
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{value || '—'}</span>
    </div>
  )
}

function StoreDetailDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const actor = useAdminActor()
  const qc = useQueryClient()
  const [confirm, setConfirm] = React.useState<'approve' | 'suspend' | 'unsuspend' | 'delete' | null>(null)
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')

  const ownerQ = useQuery({
    queryKey: ['admin-user', store.ownerId],
    queryFn: () => usersService.getById(store.ownerId),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-stores'] })

  const statusMut = useMutation({
    mutationFn: ({ status, note }: { status: StoreStatus; note?: string }) =>
      storesService.setStatus(store, status, actor, note),
    onSuccess: (_d, v) => {
      invalidate()
      toast.success(`Store ${STORE_STATUS_LABELS[v.status].toLowerCase()}`)
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const verifyMut = useMutation({
    mutationFn: (verified: boolean) => storesService.update(store.id, { verified }),
    onSuccess: (_d, verified) => {
      invalidate()
      toast.success(verified ? 'Verified badge granted' : 'Verified badge removed')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const [verified, setVerified] = React.useState(!!store.verified)

  const deleteMut = useMutation({
    mutationFn: () => storesService.remove(store.id),
    onSuccess: () => {
      invalidate()
      toast.success('Store deleted')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar src={store.logoUrl} name={store.name} />
              {store.name}
              {store.verified && <BadgeCheck className="size-5 text-primary" />}
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  STORE_STATUS_COLORS[store.status],
                )}
              >
                {STORE_STATUS_LABELS[store.status]}
              </span>
            </DialogTitle>
            <DialogDescription>Merchant application &amp; store details</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <InfoRow label="Owner" value={ownerQ.data ? `${ownerQ.data.displayName} (${ownerQ.data.email})` : store.email} />
            <InfoRow label="Store email" value={store.email} />
            <InfoRow label="Phone" value={store.phone} />
            <InfoRow label="Business name" value={store.businessName} />
            <InfoRow label="Address" value={store.address} />
            <InfoRow label="Description" value={store.description} />
            <InfoRow label="Applied" value={formatDate(store.createdAt, 'MMM D, YYYY h:mm A')} />
            <InfoRow label="Products" value={String(store.productCount)} />
            <InfoRow
              label="Business document"
              value={
                store.businessDocumentUrl ? (
                  <a
                    href={store.businessDocumentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="size-4" /> View document
                  </a>
                ) : (
                  '—'
                )
              }
            />
            {store.rejectionReason && <InfoRow label="Rejection reason" value={store.rejectionReason} />}
            <InfoRow
              label="Public page"
              value={
                <Link
                  to={`/stores/${store.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  /stores/{store.slug} <ExternalLink className="size-3.5" />
                </Link>
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Verified badge</p>
              <p className="text-xs text-muted-foreground">Shown next to the store name across the marketplace.</p>
            </div>
            <Switch
              checked={verified}
              disabled={verifyMut.isPending}
              onCheckedChange={(checked) => {
                setVerified(checked)
                verifyMut.mutate(checked)
              }}
            />
          </div>

          <DialogFooter className="flex-wrap">
            {store.status === 'pending' && (
              <>
                <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
                <Button variant="success" onClick={() => setConfirm('approve')}>
                  Approve
                </Button>
              </>
            )}
            {store.status === 'approved' && (
              <Button variant="outline" onClick={() => setConfirm('suspend')}>
                Suspend
              </Button>
            )}
            {store.status === 'suspended' && (
              <Button variant="success" onClick={() => setConfirm('unsuspend')}>
                Unsuspend
              </Button>
            )}
            {store.status === 'rejected' && (
              <Button variant="success" onClick={() => setConfirm('approve')}>
                Approve
              </Button>
            )}
            <Button variant="destructive" onClick={() => setConfirm('delete')}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === 'approve'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Approve "${store.name}"?`}
        description="The store goes live and its owner is elevated to the merchant role."
        confirmLabel="Approve store"
        onConfirm={() => statusMut.mutateAsync({ status: 'approved' }).then(() => undefined, () => undefined)}
      />
      <ConfirmDialog
        open={confirm === 'suspend'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Suspend "${store.name}"?`}
        description="The store and its products will be hidden from the marketplace until unsuspended."
        confirmLabel="Suspend"
        destructive
        onConfirm={() => statusMut.mutateAsync({ status: 'suspended' }).then(() => undefined, () => undefined)}
      />
      <ConfirmDialog
        open={confirm === 'unsuspend'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Unsuspend "${store.name}"?`}
        description="The store returns to approved status and becomes visible again."
        confirmLabel="Unsuspend"
        onConfirm={() => statusMut.mutateAsync({ status: 'approved' }).then(() => undefined, () => undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete "${store.name}"?`}
        description="This permanently removes the store record. This action cannot be undone."
        confirmLabel="Delete store"
        destructive
        onConfirm={() => deleteMut.mutateAsync().then(() => undefined, () => undefined)}
      />

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject "{store.name}"</DialogTitle>
            <DialogDescription>The reason is shared with the applicant.</DialogDescription>
          </DialogHeader>
          <FormField label="Rejection reason" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Business document is missing or unreadable…"
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim()}
              loading={statusMut.isPending}
              onClick={() => statusMut.mutate({ status: 'rejected', note: reason.trim() })}
            >
              Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
