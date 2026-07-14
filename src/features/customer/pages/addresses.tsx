import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox, EmptyState } from '@/components/ui/misc'
import { Skeleton } from '@/components/ui/skeleton'
import { FormField } from '@/components/shared/form-field'
import { SEO } from '@/components/shared/seo'
import { getErrorMessage } from '@/lib/utils'
import { usersService } from '@/services/users.service'
import { useAuthStore } from '@/stores/auth-store'
import type { Address } from '@/types'

const addressSchema = z.object({
  label: z.string().min(1, 'A label like "Home" is required'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(6, 'A valid phone number is required'),
  line1: z.string().min(3, 'Street address is required'),
  line2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  province: z.string().min(2, 'Province / state is required'),
  postalCode: z.string().min(2, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
})

type AddressValues = z.infer<typeof addressSchema>

const EMPTY_VALUES: AddressValues = {
  label: '',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  country: '',
}

export default function AddressesPage() {
  const { firebaseUser } = useAuthStore()
  const uid = firebaseUser?.uid ?? ''
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Address | null>(null)
  const [isDefault, setIsDefault] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Address | null>(null)

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['addresses', uid],
    queryFn: () => usersService.listAddresses(uid),
    enabled: Boolean(uid),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: EMPTY_VALUES,
  })

  const invalidateAddresses = () =>
    queryClient.invalidateQueries({
      queryKey: ['addresses', uid],
    })

  const clearOtherDefaults = async (exceptId?: string) => {
    const currentDefaultAddresses = (data ?? []).filter(
      (address) => address.isDefault && address.id !== exceptId,
    )

    await Promise.all(
      currentDefaultAddresses.map((address) =>
        usersService.updateAddress(uid, address.id, {
          isDefault: false,
        }),
      ),
    )
  }

  const saveMutation = useMutation({
    mutationFn: async (values: AddressValues) => {
      const payload = {
        label: values.label.trim(),
        fullName: values.fullName.trim(),
        phone: values.phone.trim(),
        line1: values.line1.trim(),
        line2: values.line2?.trim() || undefined,
        city: values.city.trim(),
        province: values.province.trim(),
        postalCode: values.postalCode.trim(),
        country: values.country.trim(),
        isDefault,
      }

      if (editing) {
        await usersService.updateAddress(uid, editing.id, payload)

        if (isDefault) {
          await clearOtherDefaults(editing.id)
        }

        return
      }

      const newAddressId = await usersService.addAddress(uid, payload)

      if (isDefault) {
        await clearOtherDefaults(newAddressId)
      }
    },

    onSuccess: async () => {
      const message = editing ? 'Address updated' : 'Address added'

      await invalidateAddresses()

      setDialogOpen(false)
      setEditing(null)
      setIsDefault(false)
      reset(EMPTY_VALUES)

      toast.success(message)
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const makeDefaultMutation = useMutation({
    mutationFn: async (address: Address) => {
      await usersService.updateAddress(uid, address.id, {
        isDefault: true,
      })

      await clearOtherDefaults(address.id)
    },

    onSuccess: async () => {
      await invalidateAddresses()
      toast.success('Default address updated')
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (address: Address) =>
      usersService.deleteAddress(uid, address.id),

    onSuccess: async () => {
      await invalidateAddresses()
      setDeleting(null)
      toast.success('Address deleted')
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const openCreate = () => {
    setEditing(null)
    setIsDefault((data?.length ?? 0) === 0)
    reset(EMPTY_VALUES)
    setDialogOpen(true)
  }

  const openEdit = (address: Address) => {
    setEditing(address)
    setIsDefault(Boolean(address.isDefault))

    reset({
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      country: address.country,
    })

    setDialogOpen(true)
  }

  const closeDialog = () => {
    if (saveMutation.isPending) return

    setDialogOpen(false)
    setEditing(null)
    setIsDefault(false)
    reset(EMPTY_VALUES)
  }

  return (
    <div className="min-w-0 overflow-x-hidden">
      <SEO title="My addresses" />

      <div className="mb-5 grid min-w-0 gap-3 sm:flex sm:items-center sm:justify-between">
        <h2 className="min-w-0 break-words text-lg font-bold tracking-tight">
          My addresses
        </h2>

        <Button
          type="button"
          size="sm"
          className="w-full min-w-0 sm:w-auto sm:shrink-0"
          onClick={openCreate}
        >
          <Plus className="size-4 shrink-0" />
          <span className="truncate">Add address</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-44 w-full rounded-xl"
            />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={MapPin}
          title="Couldn't load addresses"
          action={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          }
        />
      ) : !data?.length ? (
        <EmptyState
          icon={MapPin}
          title="No addresses yet"
          description="Save a delivery address to speed up checkout."
          action={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={openCreate}
            >
              <Plus className="size-4 shrink-0" />
              Add your first address
            </Button>
          }
        />
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {data.map((address) => (
            <Card
              key={address.id}
              className="flex min-w-0 flex-col overflow-hidden p-4 sm:p-5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">
                    {address.label}
                  </p>

                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {address.fullName}
                  </p>
                </div>

                {address.isDefault && (
                  <Badge className="shrink-0">Default</Badge>
                )}
              </div>

              <div className="mt-3 flex min-w-0 gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                <p className="min-w-0 flex-1 break-words text-sm leading-6 text-muted-foreground">
                  {address.phone}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {address.city}, {address.province} {address.postalCode},{' '}
                  {address.country}
                </p>
              </div>

              <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-0 flex-1 sm:flex-none"
                  onClick={() => openEdit(address)}
                >
                  <Pencil className="size-4 shrink-0" />
                  Edit
                </Button>

                {!address.isDefault && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 sm:flex-none"
                    loading={makeDefaultMutation.isPending}
                    onClick={() => makeDefaultMutation.mutate(address)}
                  >
                    <Star className="size-4 shrink-0" />
                    <span className="truncate">Set default</span>
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete address ${address.label}`}
                  className="ml-auto shrink-0 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(address)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

   <Dialog
  open={dialogOpen}
  onOpenChange={(open) => {
    if (open) {
      setDialogOpen(true)
    } else {
      closeDialog()
    }
  }}
>
  <DialogContent
    className="
      flex
      h-[calc(100dvh-16px)]
      max-h-[calc(100dvh-16px)]
      w-[calc(100vw-16px)]
      max-w-xl
      flex-col
      overflow-hidden
      p-0

      sm:h-auto
      sm:max-h-[90vh]
      sm:w-full
    "
  >
    <DialogHeader className="shrink-0 border-b bg-background px-4 py-4 pr-12 sm:px-6">
      <DialogTitle>
        {editing ? 'Edit address' : 'Add address'}
      </DialogTitle>
    </DialogHeader>

    <form
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onSubmit={handleSubmit((values) => {
        saveMutation.mutate(values)
      })}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <FormField
            label="Label"
            required
            error={errors.label?.message}
          >
            <Input
              {...register('label')}
              placeholder="Home, Office..."
              autoComplete="off"
            />
          </FormField>

          <FormField
            label="Full name"
            required
            error={errors.fullName?.message}
          >
            <Input
              {...register('fullName')}
              autoComplete="name"
            />
          </FormField>

          <FormField
            label="Phone"
            required
            error={errors.phone?.message}
            className="sm:col-span-2"
          >
            <Input
              {...register('phone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
          </FormField>

          <FormField
            label="Address line 1"
            required
            error={errors.line1?.message}
            className="sm:col-span-2"
          >
            <Input
              {...register('line1')}
              autoComplete="address-line1"
            />
          </FormField>

          <FormField
            label="Address line 2"
            error={errors.line2?.message}
            className="sm:col-span-2"
          >
            <Input
              {...register('line2')}
              autoComplete="address-line2"
              placeholder="Apartment, suite, area (optional)"
            />
          </FormField>

          <FormField
            label="City"
            required
            error={errors.city?.message}
          >
            <Input
              {...register('city')}
              autoComplete="address-level2"
            />
          </FormField>

          <FormField
            label="Province / State"
            required
            error={errors.province?.message}
          >
            <Input
              {...register('province')}
              autoComplete="address-level1"
            />
          </FormField>

          <FormField
            label="Postal code"
            required
            error={errors.postalCode?.message}
          >
            <Input
              {...register('postalCode')}
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </FormField>

          <FormField
            label="Country"
            required
            error={errors.country?.message}
          >
            <Input
              {...register('country')}
              autoComplete="country-name"
            />
          </FormField>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(checked) => {
                setIsDefault(checked === true)
              }}
            />

            <span className="min-w-0 break-words leading-5">
              Use as my default address
            </span>
          </label>
        </div>
      </div>

      <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={saveMutation.isPending}
            onClick={closeDialog}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            className="w-full sm:w-auto"
            loading={saveMutation.isPending}
          >
            {editing ? 'Save changes' : 'Add address'}
          </Button>
        </div>
      </div>
    </form>
  </DialogContent>
</Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
          }
        }}
        title="Delete this address?"
        description={
          deleting
            ? `"${deleting.label}" will be removed from your saved addresses.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          await deleteMutation.mutateAsync(deleting)
        }}
      />
    </div>
  )
}