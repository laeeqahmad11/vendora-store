import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Check, Star } from 'lucide-react'
import { cn, initials } from '@/lib/utils'

// ------------------------------------------------------------------ Switch
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-lg transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

// ---------------------------------------------------------------- Checkbox
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 rounded-sm border border-input shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = 'Checkbox'

// ------------------------------------------------------------------ Avatar
export function Avatar({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)}
    >
      {src ? <AvatarPrimitive.Image src={src} className="aspect-square size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

// --------------------------------------------------------------- Separator
export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    {...props}
  />
))
Separator.displayName = 'Separator'

// ------------------------------------------------------------------ Slider
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    ))}
  </SliderPrimitive.Root>
))
Slider.displayName = 'Slider'

// ------------------------------------------------------------ RatingStars
export function RatingStars({
  rating,
  count,
  size = 'sm',
  interactive = false,
  onChange,
  className,
}: {
  rating: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  onChange?: (rating: number) => void
  className?: string
}) {
  const sizeCls = { sm: 'size-3.5', md: 'size-4.5', lg: 'size-6' }[size]
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(star)}
            className={cn(interactive && 'cursor-pointer hover:scale-110 transition-transform', !interactive && 'cursor-default')}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              className={cn(
                sizeCls,
                star <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted',
              )}
            />
          </button>
        ))}
      </div>
      {count != null && <span className="text-xs text-muted-foreground">({count})</span>}
    </div>
  )
}

// ------------------------------------------------------------- EmptyState
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// --------------------------------------------------------------- Spinner
export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <div className="size-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
    </div>
  )
}

// --------------------------------------------------------------- StatCard
export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  trend,
  className,
}: {
  title: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  trend?: { value: number; label?: string }
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && (
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-4.5 text-primary" />
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {trend && (
        <p className={cn('mt-1 text-xs font-medium', trend.value >= 0 ? 'text-success' : 'text-destructive')}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label ?? 'vs last period'}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
