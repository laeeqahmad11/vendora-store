import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Label + control + validation error wrapper for react-hook-form fields */
export function FormField({
  label,
  error,
  required,
  hint,
  children,
  className,
}: {
  label?: string
  error?: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}
