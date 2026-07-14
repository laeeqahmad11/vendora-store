import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { Image as ImageIcon, Megaphone, Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState, Switch } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { cmsService } from '@/services/cms.service'
import { discountsService } from '@/services/discounts.service'
import { formatDate, getErrorMessage } from '@/lib/utils'
import type { Banner, Coupon, DiscountType, Promotion } from '@/types'

const toDateInput = (ms?: number) => (ms ? dayjs(ms).format('YYYY-MM-DD') : '')
const fromDateInput = (v: string) => (v ? dayjs(v).startOf('day').valueOf() : undefined)
const fromDateInputEnd = (v: string) => (v ? dayjs(v).endOf('day').valueOf() : undefined)

export default function PromotionsPage() {
  return (
    <div>
      <PageHeader
        title="Promotions"
        description="Homepage banners, platform-wide coupons and festival campaigns."
      />
      <Tabs defaultValue="banners">
        <TabsList>
          <TabsTrigger value="banners">Banners</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>
        <TabsContent value="banners">
          <BannersTab />
        </TabsContent>
        <TabsContent value="coupons">
          <CouponsTab />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// -------------------------------------------------------------------- Banners

function BannersTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<Banner | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Banner | null>(null)

  const bannersQ = useQuery({ queryKey: ['admin-banners'], queryFn: () => cmsService.listBanners() })

  const deleteMut = useMutation({
    mutationFn: (id: string) => cmsService.deleteBanner(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-banners'] })
      toast.success('Banner deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New banner
        </Button>
      </div>
      {bannersQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : (bannersQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No banners yet"
          description="Add hero and strip banners for the storefront homepage."
          action={<Button onClick={() => setEditing('new')}>New banner</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banner</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bannersQ.data ?? []).map((banner) => (
              <TableRow key={banner.id}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <img src={banner.imageUrl} alt={banner.title} className="h-10 w-16 rounded-lg border object-cover" />
                    <span>
                      <span className="block font-medium">{banner.title}</span>
                      {banner.subtitle && <span className="block text-xs text-muted-foreground">{banner.subtitle}</span>}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="capitalize">{banner.placement}</TableCell>
                <TableCell>{banner.sortOrder}</TableCell>
                <TableCell>{banner.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(banner)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(banner)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <BannerDialog banner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete banner "${deleting?.title}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          deleting ? deleteMut.mutateAsync(deleting.id).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function BannerDialog({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = React.useState(banner?.title ?? '')
  const [subtitle, setSubtitle] = React.useState(banner?.subtitle ?? '')
  const [images, setImages] = React.useState<string[]>(banner?.imageUrl ? [banner.imageUrl] : [])
  const [linkUrl, setLinkUrl] = React.useState(banner?.linkUrl ?? '')
  const [placement, setPlacement] = React.useState<Banner['placement']>(banner?.placement ?? 'hero')
  const [active, setActive] = React.useState(banner?.active ?? true)
  const [sortOrder, setSortOrder] = React.useState(String(banner?.sortOrder ?? 0))

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        imageUrl: images[0] ?? '',
        linkUrl: linkUrl.trim(),
        placement,
        active,
        sortOrder: Number(sortOrder) || 0,
      }
      if (banner) await cmsService.updateBanner(banner.id, data)
      else await cmsService.createBanner(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-banners'] })
      toast.success(banner ? 'Banner updated' : 'Banner created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{banner ? 'Edit banner' : 'New banner'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Subtitle">
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </FormField>
          <FormField label="Image" required>
            <ImageUploader value={images} onChange={setImages} folder="banners" max={1} />
          </FormField>
          <FormField label="Link URL" hint="Where the banner points, e.g. /products?category=sale">
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Placement">
              <Select value={placement} onValueChange={(v) => setPlacement(v as Banner['placement'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hero">Hero</SelectItem>
                  <SelectItem value="strip">Strip</SelectItem>
                  <SelectItem value="sidebar">Sidebar</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Sort order">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
            <FormField label="Active">
              <div className="flex h-10 items-center">
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || images.length === 0}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {banner ? 'Save changes' : 'Create banner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -------------------------------------------------------------------- Coupons

const COUPON_TYPES: { value: DiscountType; label: string }[] = [
  { value: 'percentage', label: 'Percentage off' },
  { value: 'fixed', label: 'Fixed amount off' },
  { value: 'bogo', label: 'Buy one get one' },
  { value: 'first_order', label: 'First order' },
]

function CouponsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<Coupon | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Coupon | null>(null)

  const couponsQ = useQuery({ queryKey: ['admin-coupons'], queryFn: () => discountsService.listCoupons() })
  const globals = (couponsQ.data ?? []).filter((c) => !c.storeId)

  const deleteMut = useMutation({
    mutationFn: (id: string) => discountsService.deleteCoupon(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] })
      toast.success('Coupon deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New coupon
        </Button>
      </div>
      {couponsQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : globals.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No platform coupons"
          description="Create codes that work across every store."
          action={<Button onClick={() => setEditing('new')}>New coupon</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {globals.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell className="font-mono font-semibold">{coupon.code}</TableCell>
                <TableCell>{COUPON_TYPES.find((t) => t.value === coupon.type)?.label ?? coupon.type}</TableCell>
                <TableCell>{coupon.type === 'percentage' ? `${coupon.value}%` : coupon.value}</TableCell>
                <TableCell>
                  {coupon.usedCount}
                  {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'Never'}
                </TableCell>
                <TableCell>{coupon.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(coupon)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(coupon)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <CouponDialog coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete coupon "${deleting?.code}"?`}
        description="Customers can no longer redeem this code. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          deleting ? deleteMut.mutateAsync(deleting.id).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function CouponDialog({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [code, setCode] = React.useState(coupon?.code ?? '')
  const [type, setType] = React.useState<DiscountType>(coupon?.type ?? 'percentage')
  const [value, setValue] = React.useState(String(coupon?.value ?? ''))
  const [minOrderAmount, setMinOrderAmount] = React.useState(coupon?.minOrderAmount ? String(coupon.minOrderAmount) : '')
  const [maxDiscount, setMaxDiscount] = React.useState(coupon?.maxDiscount ? String(coupon.maxDiscount) : '')
  const [usageLimit, setUsageLimit] = React.useState(coupon?.usageLimit ? String(coupon.usageLimit) : '')
  const [startsAt, setStartsAt] = React.useState(toDateInput(coupon?.startsAt))
  const [expiresAt, setExpiresAt] = React.useState(toDateInput(coupon?.expiresAt))
  const [active, setActive] = React.useState(coupon?.active ?? true)

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        code: code.trim().toUpperCase(),
        type,
        value: Number(value) || 0,
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : undefined,
        maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
        startsAt: fromDateInput(startsAt),
        expiresAt: fromDateInputEnd(expiresAt),
        active,
      }
      if (coupon) await discountsService.updateCoupon(coupon.id, data)
      else await discountsService.createCoupon(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] })
      toast.success(coupon ? 'Coupon updated' : 'Coupon created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{coupon ? 'Edit coupon' : 'New platform coupon'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Code" required>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" />
            </FormField>
            <FormField label="Type">
              <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUPON_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label={type === 'percentage' ? 'Percent off' : 'Amount'} required>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
            <FormField label="Min order">
              <Input type="number" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} />
            </FormField>
            <FormField label="Max discount">
              <Input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Usage limit">
              <Input type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
            </FormField>
            <FormField label="Starts">
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </FormField>
            <FormField label="Expires">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Active">
            <div className="flex h-10 items-center">
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!code.trim() || !value}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {coupon ? 'Save changes' : 'Create coupon'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Campaigns

const PROMO_TYPES: Promotion['type'][] = ['festival', 'flash_sale', 'clearance', 'banner', 'featured']

function CampaignsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<Promotion | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Promotion | null>(null)

  const promosQ = useQuery({ queryKey: ['admin-promotions'], queryFn: () => discountsService.listPromotions() })
  const globals = (promosQ.data ?? []).filter((p) => !p.storeId)

  const deleteMut = useMutation({
    mutationFn: (id: string) => discountsService.deletePromotion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.success('Campaign deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New campaign
        </Button>
      </div>
      {promosQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : globals.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Run festival sales and platform-wide promotions."
          action={<Button onClick={() => setEditing('new')}>New campaign</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {globals.map((promo) => (
              <TableRow key={promo.id}>
                <TableCell>
                  <span className="block font-medium">{promo.title}</span>
                  {promo.subtitle && <span className="block text-xs text-muted-foreground">{promo.subtitle}</span>}
                </TableCell>
                <TableCell className="capitalize">{promo.type.replace(/_/g, ' ')}</TableCell>
                <TableCell>{promo.discountPercent ? `${promo.discountPercent}%` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(promo.startsAt)} → {formatDate(promo.endsAt)}
                </TableCell>
                <TableCell>{promo.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(promo)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(promo)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <CampaignDialog promotion={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete campaign "${deleting?.title}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          deleting ? deleteMut.mutateAsync(deleting.id).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function CampaignDialog({ promotion, onClose }: { promotion: Promotion | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = React.useState(promotion?.title ?? '')
  const [subtitle, setSubtitle] = React.useState(promotion?.subtitle ?? '')
  const [type, setType] = React.useState<Promotion['type']>(promotion?.type ?? 'festival')
  const [images, setImages] = React.useState<string[]>(promotion?.imageUrl ? [promotion.imageUrl] : [])
  const [linkUrl, setLinkUrl] = React.useState(promotion?.linkUrl ?? '')
  const [discountPercent, setDiscountPercent] = React.useState(
    promotion?.discountPercent ? String(promotion.discountPercent) : '',
  )
  const [startsAt, setStartsAt] = React.useState(toDateInput(promotion?.startsAt) || dayjs().format('YYYY-MM-DD'))
  const [endsAt, setEndsAt] = React.useState(
    toDateInput(promotion?.endsAt) || dayjs().add(7, 'day').format('YYYY-MM-DD'),
  )
  const [placement, setPlacement] = React.useState<NonNullable<Promotion['placement']>>(
    promotion?.placement ?? 'carousel',
  )
  const [sortOrder, setSortOrder] = React.useState(String(promotion?.sortOrder ?? 0))
  const [active, setActive] = React.useState(promotion?.active ?? true)

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        type,
        imageUrl: images[0] ?? '',
        linkUrl: linkUrl.trim(),
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        startsAt: fromDateInput(startsAt) ?? Date.now(),
        endsAt: fromDateInputEnd(endsAt) ?? Date.now(),
        placement,
        sortOrder: Number(sortOrder) || 0,
        active,
      }
      if (promotion) await discountsService.updatePromotion(promotion.id, data)
      else await discountsService.createPromotion(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.success(promotion ? 'Campaign updated' : 'Campaign created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{promotion ? 'Edit campaign' : 'New campaign'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Eid Mega Sale" />
            </FormField>
            <FormField label="Subtitle">
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type">
              <Select value={type} onValueChange={(v) => setType(v as Promotion['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMO_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Discount %">
              <Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
            </FormField>
            <FormField label="Placement">
              <Select value={placement} onValueChange={(v) => setPlacement(v as NonNullable<Promotion['placement']>)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hero">Hero</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                  <SelectItem value="strip">Strip</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Starts" required>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </FormField>
            <FormField label="Ends" required>
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </FormField>
            <FormField label="Sort order">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Image">
            <ImageUploader value={images} onChange={setImages} folder="promotions" max={1} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Link URL">
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </FormField>
            <FormField label="Active">
              <div className="flex h-10 items-center">
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !startsAt || !endsAt}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {promotion ? 'Save changes' : 'Create campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
