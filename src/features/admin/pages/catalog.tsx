import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronRight, FolderTree, Layers, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
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
import { Avatar, Checkbox, EmptyState, Switch } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { catalogService } from '@/services/catalog.service'
import { productsService } from '@/services/products.service'
import { cn, formatCurrency, getErrorMessage } from '@/lib/utils'
import type { Brand, Category, Collection } from '@/types'

export default function CatalogPage() {
  return (
    <div>
      <PageHeader title="Catalog" description="Global taxonomy: categories, brands and curated collections." />
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="brands">
          <BrandsTab />
        </TabsContent>
        <TabsContent value="collections">
          <CollectionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ----------------------------------------------------------------- Categories

function CategoriesTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [editing, setEditing] = React.useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Category | null>(null)

  const categoriesQ = useQuery({ queryKey: ['admin-categories'], queryFn: () => catalogService.listCategories() })
  const categories = categoriesQ.data ?? []
  const topLevel = categories.filter((c) => !c.parentId)
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id)

  const deleteMut = useMutation({
    mutationFn: (id: string) => catalogService.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      toast.success('Category deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New category
        </Button>
      </div>

      {categoriesQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : topLevel.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Create the first top-level category to structure the marketplace."
          action={<Button onClick={() => setEditing('new')}>New category</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {topLevel.map((cat) => {
            const subs = childrenOf(cat.id)
            const open = !!expanded[cat.id]
            return (
              <div key={cat.id} className="border-b last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }))}
                    className={cn('rounded p-1 hover:bg-accent', subs.length === 0 && 'invisible')}
                    aria-label={open ? 'Collapse' : 'Expand'}
                  >
                    <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
                  </button>
                  <Avatar src={cat.imageUrl} name={cat.name} className="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {cat.name}
                      {cat.featured && (
                        <Badge className="ml-2" variant="default">
                          Featured
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subs.length} subcategor{subs.length === 1 ? 'y' : 'ies'} · sort {cat.sortOrder ?? 0}
                    </p>
                  </div>
                  <CategoryRowActions category={cat} onEdit={setEditing} onDelete={setDeleting} />
                </div>
                {open &&
                  subs.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 border-t bg-muted/20 py-2 pl-16 pr-4">
                      <Avatar src={sub.imageUrl} name={sub.name} className="size-7 rounded-md" />
                      <p className="min-w-0 flex-1 truncate text-sm">{sub.name}</p>
                      <CategoryRowActions category={sub} onEdit={setEditing} onDelete={setDeleting} />
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          parents={topLevel}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Products keep their category id, but the category disappears from navigation. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          deleting ? deleteMut.mutateAsync(deleting.id).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function CategoryRowActions({
  category,
  onEdit,
  onDelete,
}: {
  category: Category
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(category)} aria-label="Edit">
        <Pencil className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => onDelete(category)} aria-label="Delete">
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  )
}

function CategoryDialog({
  category,
  parents,
  onClose,
}: {
  category: Category | null
  parents: Category[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = React.useState(category?.name ?? '')
  const [parentId, setParentId] = React.useState(category?.parentId ?? 'none')
  const [description, setDescription] = React.useState(category?.description ?? '')
  const [images, setImages] = React.useState<string[]>(category?.imageUrl ? [category.imageUrl] : [])
  const [featured, setFeatured] = React.useState(!!category?.featured)
  const [sortOrder, setSortOrder] = React.useState(String(category?.sortOrder ?? 0))

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        name: name.trim(),
        parentId: parentId === 'none' ? null : parentId,
        description: description.trim(),
        imageUrl: images[0] ?? '',
        featured,
        sortOrder: Number(sortOrder) || 0,
      }
      if (category) await catalogService.updateCategory(category.id, data)
      else await catalogService.createCategory(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      toast.success(category ? 'Category updated' : 'Category created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electronics" />
          </FormField>
          <FormField label="Parent category" hint="Leave as top-level, or nest it as a subcategory.">
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top-level</SelectItem>
                {parents
                  .filter((p) => p.id !== category?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Image">
            <ImageUploader value={images} onChange={setImages} folder="categories" max={1} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Sort order">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
            <FormField label="Featured">
              <div className="flex h-10 items-center">
                <Switch checked={featured} onCheckedChange={setFeatured} />
              </div>
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {category ? 'Save changes' : 'Create category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------------- Brands

function BrandsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<Brand | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Brand | null>(null)

  const brandsQ = useQuery({ queryKey: ['admin-brands'], queryFn: () => catalogService.listBrands() })

  const deleteMut = useMutation({
    mutationFn: (id: string) => catalogService.deleteBrand(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-brands'] })
      toast.success('Brand deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New brand
        </Button>
      </div>
      {brandsQ.isLoading ? (
        <TableSkeleton rows={5} />
      ) : (brandsQ.data ?? []).length === 0 ? (
        <EmptyState icon={Tag} title="No brands yet" action={<Button onClick={() => setEditing('new')}>New brand</Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(brandsQ.data ?? []).map((brand) => (
              <TableRow key={brand.id}>
                <TableCell>
                  <span className="flex items-center gap-3 font-medium">
                    <Avatar src={brand.logoUrl} name={brand.name} className="rounded-lg" />
                    {brand.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{brand.slug}</TableCell>
                <TableCell>{brand.featured ? <Badge>Featured</Badge> : '—'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(brand)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(brand)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <BrandDialog brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
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

function BrandDialog({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState(brand?.name ?? '')
  const [images, setImages] = React.useState<string[]>(brand?.logoUrl ? [brand.logoUrl] : [])
  const [featured, setFeatured] = React.useState(!!brand?.featured)

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = { name: name.trim(), logoUrl: images[0] ?? '', featured }
      if (brand) await catalogService.updateBrand(brand.id, data)
      else await catalogService.createBrand(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-brands'] })
      toast.success(brand ? 'Brand updated' : 'Brand created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{brand ? 'Edit brand' : 'New brand'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme" />
          </FormField>
          <FormField label="Logo">
            <ImageUploader value={images} onChange={setImages} folder="brands" max={1} />
          </FormField>
          <FormField label="Featured">
            <div className="flex h-10 items-center">
              <Switch checked={featured} onCheckedChange={setFeatured} />
            </div>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {brand ? 'Save changes' : 'Create brand'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------- Collections

function CollectionsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<Collection | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Collection | null>(null)

  const collectionsQ = useQuery({
    queryKey: ['admin-collections'],
    queryFn: () => catalogService.listCollections(),
  })
  const globals = (collectionsQ.data ?? []).filter((c) => !c.storeId)

  const deleteMut = useMutation({
    mutationFn: (id: string) => catalogService.deleteCollection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-collections'] })
      toast.success('Collection deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New collection
        </Button>
      </div>
      {collectionsQ.isLoading ? (
        <TableSkeleton rows={5} />
      ) : globals.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No global collections"
          description="Curate cross-store product collections for the storefront."
          action={<Button onClick={() => setEditing('new')}>New collection</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Collection</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {globals.map((col) => (
              <TableRow key={col.id}>
                <TableCell>
                  <span className="flex items-center gap-3 font-medium">
                    <Avatar src={col.imageUrl} name={col.name} className="rounded-lg" />
                    {col.name}
                  </span>
                </TableCell>
                <TableCell>{col.productIds.length}</TableCell>
                <TableCell className="text-muted-foreground">{col.slug}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(col)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(col)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <CollectionDialog collection={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
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

function CollectionDialog({ collection, onClose }: { collection: Collection | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState(collection?.name ?? '')
  const [description, setDescription] = React.useState(collection?.description ?? '')
  const [images, setImages] = React.useState<string[]>(collection?.imageUrl ? [collection.imageUrl] : [])
  const [productIds, setProductIds] = React.useState<string[]>(collection?.productIds ?? [])
  const [search, setSearch] = React.useState('')

  const productsQ = useQuery({
    queryKey: ['admin-products-approved'],
    queryFn: () => productsService.listForSearch(1000),
  })
  const products = (productsQ.data ?? []).filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        name: name.trim(),
        description: description.trim(),
        imageUrl: images[0] ?? '',
        productIds,
      }
      if (collection) await catalogService.updateCollection(collection.id, data)
      else await catalogService.createCollection(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-collections'] })
      toast.success(collection ? 'Collection updated' : 'Collection created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const toggle = (id: string, checked: boolean) =>
    setProductIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{collection ? 'Edit collection' : 'New collection'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Picks" />
          </FormField>
          <FormField label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Cover image">
            <ImageUploader value={images} onChange={setImages} folder="collections" max={1} />
          </FormField>
          <FormField label={`Products (${productIds.length} selected)`}>
            <div className="space-y-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                {productsQ.isLoading ? (
                  <p className="p-2 text-sm text-muted-foreground">Loading products…</p>
                ) : products.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">No approved products found.</p>
                ) : (
                  products.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        checked={productIds.includes(p.id)}
                        onCheckedChange={(checked) => toggle(p.id, checked === true)}
                      />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{formatCurrency(p.price, p.currency || 'USD')}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {collection ? 'Save changes' : 'Create collection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
