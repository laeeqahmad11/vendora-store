import * as React from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/misc'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { PageHeader } from '@/layouts/dashboard-layout'
import { catalogService } from '@/services/catalog.service'
import { productsService } from '@/services/products.service'
import { getErrorMessage } from '@/lib/utils'
import type { Collection } from '@/types'
import {
  ErrorState,
  ProductPicker,
  useMerchant,
} from '../components/common'

interface CollectionForm {
  name: string
  description: string
  image: string[]
  productIds: string[]
}

const emptyForm: CollectionForm = {
  name: '',
  description: '',
  image: [],
  productIds: [],
}

export default function CollectionsPage() {
  const { store } = useMerchant()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] =
    React.useState<Collection | null>(null)
  const [deleting, setDeleting] =
    React.useState<Collection | null>(null)
  const [form, setForm] =
    React.useState<CollectionForm>(emptyForm)

  const set = <K extends keyof CollectionForm>(
    key: K,
    value: CollectionForm[K],
  ) =>
    setForm((current) => ({
      ...current,
      [key]: value,
    }))

  const collectionsQ = useQuery({
    queryKey: ['merchant-collections', store.id],
    queryFn: () =>
      catalogService.listCollections(store.id),
  })

  const productsQ = useQuery({
    queryKey: ['merchant-products', store.id],
    queryFn: () =>
      productsService.listByStore(store.id),
  })

  const openDialog = (
    collection: Collection | null,
  ) => {
    setEditing(collection)

    setForm(
      collection
        ? {
            name: collection.name,
            description:
              collection.description ?? '',
            image: collection.imageUrl
              ? [collection.imageUrl]
              : [],
            productIds: collection.productIds,
          }
        : emptyForm,
    )

    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) {
        throw new Error(
          'Collection name must be at least 2 characters.',
        )
      }

      const payload = {
        name: form.name.trim(),
        description:
          form.description.trim() || undefined,
        imageUrl: form.image[0],
        storeId: store.id,
        productIds: form.productIds,
      }

      if (editing) {
        await catalogService.updateCollection(
          editing.id,
          payload,
        )
      } else {
        await catalogService.createCollection(
          payload,
        )
      }
    },

    onSuccess: async () => {
      toast.success(
        editing
          ? 'Collection updated'
          : 'Collection created',
      )

      setDialogOpen(false)

      await queryClient.invalidateQueries({
        queryKey: [
          'merchant-collections',
          store.id,
        ],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  if (collectionsQ.isError) {
    return (
      <ErrorState
        onRetry={() =>
          void collectionsQ.refetch()
        }
      />
    )
  }

  const collections = collectionsQ.data ?? []

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Collections"
        description="Curated groups of products shown on your store page."
        actions={
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => openDialog(null)}
          >
            <Plus className="size-4" />
            New collection
          </Button>
        }
      />

      {collectionsQ.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map(
            (_, index) => (
              <Skeleton
                key={index}
                className="h-64 w-full rounded-xl"
              />
            ),
          )}
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No collections yet"
          description='Group related products — e.g. "Summer essentials" — to make browsing easier.'
          action={
            <Button
              type="button"
              onClick={() => openDialog(null)}
            >
              <Plus className="size-4" />
              Create collection
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              {collection.imageUrl ? (
                <img
                  src={collection.imageUrl}
                  alt=""
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="flex h-40 items-center justify-center bg-muted">
                  <Layers className="size-9 text-muted-foreground" />
                </div>
              )}

              <div className="space-y-3 p-4">
                <div className="min-w-0">
                  <p
                    className="truncate font-semibold"
                    title={collection.name}
                  >
                    {collection.name}
                  </p>

                  {collection.description && (
                    <p
                      className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                      title={collection.description}
                    >
                      {collection.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {collection.productIds.length}{' '}
                    product
                    {collection.productIds.length === 1
                      ? ''
                      : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      openDialog(collection)
                    }
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() =>
                      setDeleting(collection)
                    }
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl p-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle>
              {editing
                ? 'Edit collection'
                : 'New collection'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <FormField
              label="Name"
              required
            >
              <Input
                placeholder="e.g. Summer essentials"
                value={form.name}
                onChange={(event) =>
                  set(
                    'name',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField label="Description">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(event) =>
                  set(
                    'description',
                    event.target.value,
                  )
                }
              />
            </FormField>

            <FormField label="Cover image">
              <ImageUploader
                value={form.image}
                onChange={(urls) =>
                  set('image', urls)
                }
                folder={`stores/${store.id}/collections`}
                max={1}
              />
            </FormField>

            <FormField
              label="Products"
              required
            >
              {productsQ.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <ProductPicker
                  products={productsQ.data ?? []}
                  value={form.productIds}
                  onChange={(ids) =>
                    set('productIds', ids)
                  }
                />
              )}
            </FormField>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() =>
                setDialogOpen(false)
              }
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="w-full sm:w-auto"
              loading={saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate()
              }
            >
              {editing
                ? 'Save changes'
                : 'Create collection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) =>
          !open && setDeleting(null)
        }
        title="Delete collection?"
        description={`"${deleting?.name}" will be removed. Products in it are not deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return

          try {
            await catalogService.deleteCollection(
              deleting.id,
            )

            toast.success(
              'Collection deleted',
            )

            setDeleting(null)

            await queryClient.invalidateQueries({
              queryKey: [
                'merchant-collections',
                store.id,
              ],
            })
          } catch (error) {
            toast.error(
              getErrorMessage(error),
            )
          }
        }}
      />
    </div>
  )
}