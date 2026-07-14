import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { cmsService } from '@/services/cms.service'
import { getErrorMessage } from '@/lib/utils'

interface SettingsForm {
  name: string
  tagline: string
  logo: string[]
  supportEmail: string
  currency: string
  commissionPercent: string
  seoTitle: string
  seoDescription: string
}

const EMPTY: SettingsForm = {
  name: '',
  tagline: '',
  logo: [],
  supportEmail: '',
  currency: 'USD',
  commissionPercent: '',
  seoTitle: '',
  seoDescription: '',
}

export default function PlatformSettingsPage() {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<SettingsForm>(EMPTY)

  const settingsQ = useQuery({
    queryKey: ['admin-platform-settings'],
    queryFn: () => cmsService.getPlatformSettings(),
  })

  React.useEffect(() => {
    const s = settingsQ.data
    if (!s) return
    setForm({
      name: s.name ?? '',
      tagline: s.tagline ?? '',
      logo: s.logoUrl ? [s.logoUrl] : [],
      supportEmail: s.supportEmail ?? '',
      currency: s.currency ?? 'USD',
      commissionPercent: s.commissionPercent != null ? String(s.commissionPercent) : '',
      seoTitle: s.seo?.title ?? '',
      seoDescription: s.seo?.description ?? '',
    })
  }, [settingsQ.data])

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const saveMut = useMutation({
    mutationFn: () =>
      cmsService.savePlatformSettings({
        name: form.name.trim() || 'Vendora',
        tagline: form.tagline.trim(),
        logoUrl: form.logo[0] ?? '',
        supportEmail: form.supportEmail.trim(),
        currency: form.currency.trim().toUpperCase() || 'USD',
        commissionPercent: form.commissionPercent ? Number(form.commissionPercent) : 0,
        seo: { title: form.seoTitle.trim(), description: form.seoDescription.trim() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-platform-settings'] })
      toast.success('Settings saved')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Platform Settings"
        description="Global configuration for the marketplace."
        actions={
          <Button loading={saveMut.isPending} onClick={() => saveMut.mutate()} disabled={settingsQ.isLoading}>
            <Save /> Save settings
          </Button>
        }
      />

      {settingsQ.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>Name, tagline and logo used across the storefront.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Platform name" required>
                  <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Vendora" />
                </FormField>
                <FormField label="Tagline">
                  <Input
                    value={form.tagline}
                    onChange={(e) => set('tagline', e.target.value)}
                    placeholder="The multi-vendor marketplace"
                  />
                </FormField>
              </div>
              <FormField label="Logo">
                <ImageUploader value={form.logo} onChange={(urls) => set('logo', urls)} folder="platform" max={1} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commerce</CardTitle>
              <CardDescription>Currency, commission and support contact.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <FormField label="Support email">
                <Input
                  type="email"
                  value={form.supportEmail}
                  onChange={(e) => set('supportEmail', e.target.value)}
                  placeholder="support@vendora.com"
                />
              </FormField>
              <FormField label="Currency" hint="ISO code, e.g. USD">
                <Input value={form.currency} onChange={(e) => set('currency', e.target.value)} />
              </FormField>
              <FormField label="Commission %" hint="Platform cut per sale.">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.commissionPercent}
                  onChange={(e) => set('commissionPercent', e.target.value)}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO</CardTitle>
              <CardDescription>Default metadata for storefront pages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Meta title">
                <Input value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
              </FormField>
              <FormField label="Meta description">
                <Textarea value={form.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} />
              </FormField>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <ShieldAlert className="size-4" /> Danger zone
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                Firebase credentials (API keys, project id, storage bucket) are not managed here — they live in{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.local</code> at the project root and
                require a redeploy to change. Rotating keys or switching projects should be done by a developer.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
