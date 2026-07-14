import * as React from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  BadgePercent,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  Layers,
  Package,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldX,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store as StoreIcon,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Spinner } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { SEO } from '@/components/shared/seo'
import { DashboardLayout, type DashboardNavItem } from '@/layouts/dashboard-layout'
import { useAuthStore } from '@/stores/auth-store'
import { storesService } from '@/services/stores.service'
import { storageService } from '@/services/storage.service'
import { getErrorMessage } from '@/lib/utils'
import type { Store } from '@/types'

const NAV: DashboardNavItem[] = [
  { to: '/merchant', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/merchant/products', label: 'Products', icon: Package },
  { to: '/merchant/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/merchant/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/merchant/customers', label: 'Customers', icon: Users },
  { to: '/merchant/discounts', label: 'Discounts', icon: BadgePercent },
  { to: '/merchant/collections', label: 'Collections', icon: Layers },
  { to: '/merchant/reviews', label: 'Reviews', icon: Star },
  { to: '/merchant/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/merchant/settings', label: 'Settings', icon: Settings },
]

// ------------------------------------------------------------ application

const applySchema = z.object({
  name: z.string().min(3, 'Store name must be at least 3 characters'),
  description: z.string().min(20, 'Tell customers a bit more (at least 20 characters)'),
  businessName: z.string().min(2, 'Business name is required'),
  email: z.email('Enter a valid business email'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  address: z.string().min(5, 'Business address is required'),
})

type ApplyValues = z.infer<typeof applySchema>

function ApplicationForm({ existing }: { existing?: Store | null }) {
  const { profile, role, refreshStore } = useAuthStore()
  const [logo, setLogo] = React.useState<string[]>(existing?.logoUrl ? [existing.logoUrl] : [])
  const [docUrl, setDocUrl] = React.useState<string | undefined>(existing?.businessDocumentUrl)
  const [docUploading, setDocUploading] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      name: existing?.name ?? '',
      description: existing?.description ?? '',
      businessName: existing?.businessName ?? '',
      email: existing?.email ?? profile?.email ?? '',
      phone: existing?.phone ?? profile?.phone ?? '',
      address: existing?.address ?? '',
    },
  })

  const onSubmit = async (values: ApplyValues) => {
    if (!profile) return
    try {
      const payload = {
        ...values,
        logoUrl: logo[0],
        businessDocumentUrl: docUrl,
      }
      if (existing) {
        await storesService.update(existing.id, { ...payload, status: 'pending', rejectionReason: '' })
        toast.success('Application re-submitted for review.')
      } else {
        await storesService.apply(payload, {
          id: profile.id,
          name: profile.displayName,
          role: role ?? 'customer',
        })
        toast.success('Application submitted! We will review it shortly.')
      }
      await refreshStore()
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const onDocChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocUploading(true)
    try {
      const url = await storageService.uploadFile(file, 'stores/documents')
      setDocUrl(url)
      toast.success('Document uploaded')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDocUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{existing ? 'Update your application' : 'Store application'}</CardTitle>
        <CardDescription>
          Tell us about your business. Our team reviews every application before your store goes live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Store name" required error={errors.name?.message}>
              <Input placeholder="e.g. Aurora Living" {...register('name')} />
            </FormField>
            <FormField label="Legal business name" required error={errors.businessName?.message}>
              <Input placeholder="e.g. Aurora Living LLC" {...register('businessName')} />
            </FormField>
          </div>
          <FormField
            label="Store description"
            required
            error={errors.description?.message}
            hint="Shown on your public store page."
          >
            <Textarea rows={4} placeholder="What do you sell? What makes your brand special?" {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Business email" required error={errors.email?.message}>
              <Input type="email" placeholder="hello@yourbrand.com" {...register('email')} />
            </FormField>
            <FormField label="Phone" required error={errors.phone?.message}>
              <Input type="tel" placeholder="+1 555 000 1234" {...register('phone')} />
            </FormField>
          </div>
          <FormField label="Business address" required error={errors.address?.message}>
            <Input placeholder="Street, city, country" {...register('address')} />
          </FormField>
          <FormField label="Store logo" hint="Square image works best.">
            <ImageUploader value={logo} onChange={setLogo} folder="stores/logos" max={1} />
          </FormField>
          <FormField
            label="Business document (optional)"
            hint="Trade licence or registration document — speeds up verification."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Input type="file" accept=".pdf,image/*" onChange={onDocChange} disabled={docUploading} className="max-w-xs" />
              {docUploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
              {docUrl && !docUploading && (
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <FileText className="size-3.5" /> Document attached
                </a>
              )}
            </div>
          </FormField>
          <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
            {existing ? 'Re-submit application' : 'Submit application'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ApplyPage() {
  return (
    <FullPage>
      <SEO title="Sell on Vendora" description="Open your own store on Vendora and reach thousands of customers." />
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <StoreIcon className="size-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Open your store on Vendora</h1>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Join thousands of independent brands selling on Vendora. List products, manage orders with cash
            on delivery, and grow with built-in analytics — no monthly fees.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Rocket, title: 'Launch fast', text: 'Apply in minutes; go live once approved.' },
            { icon: Truck, title: 'You fulfil, you earn', text: 'Cash on delivery — you collect payment directly.' },
            { icon: BarChart3, title: 'Grow smart', text: 'Dashboards, discounts and reviews built in.' },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-4 text-center">
              <f.icon className="mx-auto mb-2 size-5 text-primary" />
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
        <ApplicationForm />
      </div>
    </FullPage>
  )
}

// ---------------------------------------------------------- status screens

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingBag className="size-4.5" />
            </span>
            Vendora
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Back to storefront</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
    </div>
  )
}

function PendingScreen({ store }: { store: Store }) {
  const steps = [
    { icon: CheckCircle2, title: 'Application received', text: `"${store.name}" was submitted successfully.`, done: true },
    { icon: Clock, title: 'Under review', text: 'Our team verifies your business details — usually within 1–2 business days.', done: false },
    { icon: Rocket, title: 'Go live', text: 'Once approved you can list products and start selling immediately.', done: false },
  ]
  return (
    <FullPage>
      <SEO title="Application under review" />
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-warning/15">
          <Clock className="size-7 text-warning" />
        </div>
        <h1 className="text-2xl font-bold">Your application is under review</h1>
        <p className="mt-2 text-muted-foreground">
          Thanks for applying! We&apos;ll notify you by email and in-app as soon as a decision is made.
        </p>
        <div className="mt-8 space-y-4 text-left">
          {steps.map((s) => (
            <div key={s.title} className="flex gap-3 rounded-xl border bg-card p-4">
              <s.icon className={s.done ? 'mt-0.5 size-5 shrink-0 text-success' : 'mt-0.5 size-5 shrink-0 text-muted-foreground'} />
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </FullPage>
  )
}

function RejectedScreen({ store }: { store: Store }) {
  return (
    <FullPage>
      <SEO title="Application rejected" />
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldX className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h1 className="font-semibold">Your application was rejected</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {store.rejectionReason
                  ? `Reason: ${store.rejectionReason}`
                  : 'No specific reason was provided. Please review your details and re-apply.'}
              </p>
            </div>
          </div>
        </div>
        <ApplicationForm existing={store} />
      </div>
    </FullPage>
  )
}

function SuspendedScreen({ store }: { store: Store }) {
  return (
    <FullPage>
      <SEO title="Store suspended" />
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <ShieldAlert className="size-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">&quot;{store.name}&quot; is suspended</h1>
        <p className="mt-2 text-muted-foreground">
          Your store has been suspended by the Vendora team and is not visible to customers. If you believe
          this is a mistake, please contact platform support.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/">Back to storefront</Link>
        </Button>
      </div>
    </FullPage>
  )
}

// ------------------------------------------------------------------- gate

export function MerchantGate() {
  const { role, store, loading, initialized } = useAuthStore()

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (role === 'admin') {
    return (
      <FullPage>
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-bold">You&apos;re signed in as an admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The merchant dashboard is for store owners. Head over to the admin console instead.
          </p>
          <Button asChild className="mt-5">
            <Link to="/admin">Go to admin console</Link>
          </Button>
        </div>
      </FullPage>
    )
  }

  if (!store) return <ApplyPage />
  if (store.status === 'pending') return <PendingScreen store={store} />
  if (store.status === 'rejected') return <RejectedScreen store={store} />
  if (store.status === 'suspended') return <SuspendedScreen store={store} />

  return <DashboardLayout title="Merchant" nav={NAV} />
}
