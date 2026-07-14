import * as React from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { MailCheck, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { SEO } from '@/components/shared/seo'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth-store'
import { roleHome } from '@/components/shared/route-guards'
import { APP_NAME } from '@/lib/constants'
import { getErrorMessage } from '@/lib/utils'

// ------------------------------------------------------------------ layout

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-primary via-primary to-indigo-950 p-10 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
            <ShoppingBag className="size-5" />
          </span>
          {APP_NAME}
        </Link>
        <div>
          <h1 className="max-w-md text-4xl font-bold leading-tight">
            One marketplace. Thousands of independent brands.
          </h1>
          <p className="mt-4 max-w-md text-primary-foreground/75">
            Shop from verified merchants with cash on delivery, or open your own store and start selling in
            minutes.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">© {new Date().getFullYear()} {APP_NAME}</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-slide-up">
          <Link to="/" className="mb-8 flex items-center gap-2 font-bold lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingBag className="size-4.5" />
            </span>
            {APP_NAME}
          </Link>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function useRedirectAfterAuth() {
  const navigate = useNavigate()
  const location = useLocation()
  return React.useCallback(
    (role?: string | null) => {
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? roleHome(role as never), { replace: true })
    },
    [navigate, location.state],
  )
}

function GoogleButton({ onDone }: { onDone: (role?: string | null) => void }) {
  const [loading, setLoading] = React.useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      loading={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const profile = await authService.loginWithGoogle()
          toast.success(`Welcome, ${profile.displayName}!`)
          onDone(profile.role)
        } catch (e) {
          toast.error(getErrorMessage(e))
        } finally {
          setLoading(false)
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path
          fill="currentColor"
          d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81"
        />
      </svg>
      Continue with Google
    </Button>
  )
}

// ------------------------------------------------------------------- login

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export function LoginPage() {
  const redirect = useRedirectAfterAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })

  return (
    <div className="space-y-6">
      <SEO title="Sign in" />
      <div>
        <h2 className="text-2xl font-bold">Welcome back</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your {APP_NAME} account</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (data) => {
          try {
            const profile = await authService.login(data.email, data.password)
            toast.success(`Welcome back, ${profile.displayName}!`)
            redirect(profile.role)
          } catch (e) {
            toast.error(getErrorMessage(e))
          }
        })}
      >
        <FormField label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
        </FormField>
        <FormField label="Password" error={errors.password?.message} required>
          <Input type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} />
        </FormField>
        <div className="flex justify-end">
          <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="relative text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-background px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>

      <GoogleButton onDone={redirect} />

      <p className="text-center text-sm text-muted-foreground">
        New to {APP_NAME}?{' '}
        <Link to="/auth/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- register

const registerSchema = z
  .object({
    displayName: z.string().min(2, 'Enter your full name'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function RegisterPage() {
  const redirect = useRedirectAfterAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) })

  return (
    <div className="space-y-6">
      <SEO title="Create account" />
      <div>
        <h2 className="text-2xl font-bold">Create your account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shop thousands of products — or apply to open your own store
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (data) => {
          try {
            await authService.register(data.email, data.password, data.displayName)
            toast.success('Account created! A verification email is on its way.')
            redirect('customer')
          } catch (e) {
            toast.error(getErrorMessage(e))
          }
        })}
      >
        <FormField label="Full name" error={errors.displayName?.message} required>
          <Input autoComplete="name" placeholder="Jane Doe" {...register('displayName')} />
        </FormField>
        <FormField label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
        </FormField>
        <FormField label="Password" error={errors.password?.message} required>
          <Input type="password" autoComplete="new-password" placeholder="At least 6 characters" {...register('password')} />
        </FormField>
        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          <Input type="password" autoComplete="new-password" placeholder="Repeat your password" {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>

      <div className="relative text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-background px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>

      <GoogleButton onDone={redirect} />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/auth/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

// --------------------------------------------------------- forgot password

const forgotSchema = z.object({ email: z.string().email('Enter a valid email address') })

export function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/10">
          <MailCheck className="size-7 text-success" />
        </div>
        <h2 className="text-2xl font-bold">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          We sent a password reset link to your email. Follow it to choose a new password.
        </p>
        <Button asChild className="w-full">
          <Link to="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SEO title="Reset password" />
      <div>
        <h2 className="text-2xl font-bold">Reset your password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your account email and we'll send you a reset link.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (data) => {
          try {
            await authService.forgotPassword(data.email)
            setSent(true)
          } catch (e) {
            toast.error(getErrorMessage(e))
          }
        })}
      >
        <FormField label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/auth/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

// ------------------------------------------------------------- suspended

export function SuspendedPage() {
  const { profile } = useAuthStore()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Account suspended</h1>
      <p className="max-w-md text-muted-foreground">
        {profile?.displayName ? `${profile.displayName}, your` : 'Your'} account has been suspended by the
        platform administrators. Contact support if you believe this is a mistake.
      </p>
      <Button
        variant="outline"
        onClick={async () => {
          await authService.logout()
          window.location.href = '/'
        }}
      >
        Sign out
      </Button>
    </div>
  )
}
