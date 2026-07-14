import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  Copy,
  ExternalLink,
  Save,
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
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { PageHeader } from '@/layouts/dashboard-layout'
import { useAuthStore } from '@/stores/auth-store'
import { storesService } from '@/services/stores.service'
import { getErrorMessage } from '@/lib/utils'
import { useMerchant } from '../components/common'

const schema = z.object({
  name: z
    .string()
    .min(
      3,
      'Store name must be at least 3 characters',
    ),
  description: z
    .string()
    .min(
      20,
      'Description must be at least 20 characters',
    ),
  email: z.email('Enter a valid email'),
  phone: z
    .string()
    .min(7, 'Enter a valid phone number'),
  address: z.string().optional(),
  businessName: z.string().optional(),
  businessHours: z.string().optional(),
  shippingPolicy: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  twitter: z.string().optional(),
  website: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function StoreSettingsPage() {
  const { store } = useMerchant()

  const refreshStore = useAuthStore(
    (state) => state.refreshStore,
  )

  const [logo, setLogo] = React.useState<
    string[]
  >(store.logoUrl ? [store.logoUrl] : [])

  const [banner, setBanner] = React.useState<
    string[]
  >(store.bannerUrl ? [store.bannerUrl] : [])

  const {
    register,
    handleSubmit,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: store.name,
      description: store.description,
      email: store.email,
      phone: store.phone,
      address: store.address ?? '',
      businessName:
        store.businessName ?? '',
      businessHours:
        store.businessHours ?? '',
      shippingPolicy:
        store.shippingPolicy ?? '',
      facebook:
        store.socialLinks?.facebook ?? '',
      instagram:
        store.socialLinks?.instagram ?? '',
      twitter:
        store.socialLinks?.twitter ?? '',
      website:
        store.socialLinks?.website ?? '',
      seoTitle: store.seo?.title ?? '',
      seoDescription:
        store.seo?.description ?? '',
    },
  })

  const storeUrl = `${window.location.origin}/stores/${store.slug}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        storeUrl,
      )

      toast.success('Store link copied')
    } catch {
      toast.error(
        'Could not copy the link',
      )
    }
  }

  const onSubmit = async (
    values: FormValues,
  ) => {
    try {
      await storesService.update(store.id, {
        name: values.name,
        description: values.description,
        email: values.email,
        phone: values.phone,
        address:
          values.address || undefined,
        businessName:
          values.businessName || undefined,
        businessHours:
          values.businessHours || undefined,
        shippingPolicy:
          values.shippingPolicy || undefined,
        logoUrl: logo[0],
        bannerUrl: banner[0],
        socialLinks: {
          ...(values.facebook
            ? {
                facebook:
                  values.facebook,
              }
            : {}),
          ...(values.instagram
            ? {
                instagram:
                  values.instagram,
              }
            : {}),
          ...(values.twitter
            ? {
                twitter:
                  values.twitter,
              }
            : {}),
          ...(values.website
            ? {
                website:
                  values.website,
              }
            : {}),
        },
        seo:
          values.seoTitle ||
          values.seoDescription
            ? {
                ...(values.seoTitle
                  ? {
                      title:
                        values.seoTitle,
                    }
                  : {}),
                ...(values.seoDescription
                  ? {
                      description:
                        values.seoDescription,
                    }
                  : {}),
              }
            : undefined,
      })

      await refreshStore()

      toast.success(
        'Store settings saved',
      )
    } catch (error) {
      toast.error(
        getErrorMessage(error),
      )
    }
  }

  return (
    <form
      className="min-w-0 space-y-6"
      onSubmit={handleSubmit(onSubmit)}
    >
      <PageHeader
        title="Store settings"
        description="Your public store profile and policies."
        actions={
          <Button
            type="submit"
            className="w-full sm:w-auto"
            loading={isSubmitting}
          >
            <Save className="size-4" />
            Save changes
          </Button>
        }
      />

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Store link</CardTitle>

          <CardDescription>
            Share this link with your customers.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <code
              className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm"
              title={storeUrl}
            >
              {storeUrl}
            </code>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={copyLink}
              >
                <Copy className="size-4" />
                Copy
              </Button>

              <Button
                asChild
                type="button"
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
              >
                <a
                  href={`/stores/${store.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Visit
                </a>
              </Button>
            </div>

            {store.verified && (
              <Badge
                variant="success"
                className="w-fit"
              >
                Verified store
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Profile</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            <FormField
              label="Store name"
              required
              error={errors.name?.message}
            >
              <Input
                {...register('name')}
              />
            </FormField>

            <FormField
              label="Description"
              required
              error={
                errors.description?.message
              }
            >
              <Textarea
                rows={4}
                className="resize-y"
                {...register('description')}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Email"
                required
                error={
                  errors.email?.message
                }
              >
                <Input
                  type="email"
                  {...register('email')}
                />
              </FormField>

              <FormField
                label="Phone"
                required
                error={
                  errors.phone?.message
                }
              >
                <Input
                  type="tel"
                  {...register('phone')}
                />
              </FormField>
            </div>

            <FormField label="Business name">
              <Input
                {...register(
                  'businessName',
                )}
              />
            </FormField>

            <FormField label="Address">
              <Input
                {...register('address')}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Branding</CardTitle>

            <CardDescription>
              Shown on your public store page.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
            <FormField
              label="Logo"
              hint="Square image works best."
            >
              <ImageUploader
                value={logo}
                onChange={setLogo}
                folder={`stores/${store.id}/branding`}
                max={1}
              />
            </FormField>

            <FormField
              label="Banner"
              hint="Wide image, e.g. 1600×400."
            >
              <ImageUploader
                value={banner}
                onChange={setBanner}
                folder={`stores/${store.id}/branding`}
                max={1}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>
              Policies & hours
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            <FormField
              label="Business hours"
              hint="e.g. Mon–Fri 9:00–18:00, Sat 10:00–14:00"
            >
              <Input
                {...register(
                  'businessHours',
                )}
              />
            </FormField>

            <FormField label="Shipping policy">
              <Textarea
                rows={5}
                className="resize-y"
                placeholder="Delivery times, areas covered, fees…"
                {...register(
                  'shippingPolicy',
                )}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>
              Social links & SEO
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Facebook">
                <Input
                  placeholder="https://facebook.com/…"
                  {...register('facebook')}
                />
              </FormField>

              <FormField label="Instagram">
                <Input
                  placeholder="https://instagram.com/…"
                  {...register('instagram')}
                />
              </FormField>

              <FormField label="Twitter / X">
                <Input
                  placeholder="https://x.com/…"
                  {...register('twitter')}
                />
              </FormField>

              <FormField label="Website">
                <Input
                  placeholder="https://…"
                  {...register('website')}
                />
              </FormField>
            </div>

            <FormField label="SEO title">
              <Input
                placeholder="Defaults to store name"
                {...register('seoTitle')}
              />
            </FormField>

            <FormField label="SEO description">
              <Textarea
                rows={4}
                className="resize-y"
                {...register(
                  'seoDescription',
                )}
              />
            </FormField>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex justify-end">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            loading={isSubmitting}
          >
            <Save className="size-4" />
            Save changes
          </Button>
        </div>
      </div>
    </form>
  )
}