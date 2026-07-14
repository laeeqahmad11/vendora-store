import * as React from 'react'
import { cn } from '@/lib/utils'

function diffParts(endsAt: number) {
  const total = Math.max(0, endsAt - Date.now())
  return {
    total,
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total / 3_600_000) % 24),
    minutes: Math.floor((total / 60_000) % 60),
    seconds: Math.floor((total / 1_000) % 60),
  }
}

/** Live countdown timer (updates every second) */
export function Countdown({ endsAt, className }: { endsAt: number; className?: string }) {
  const [parts, setParts] = React.useState(() => diffParts(endsAt))

  React.useEffect(() => {
    setParts(diffParts(endsAt))
    const id = setInterval(() => setParts(diffParts(endsAt)), 1000)
    return () => clearInterval(id)
  }, [endsAt])

  const cells = [
    { label: 'Days', value: parts.days },
    { label: 'Hrs', value: parts.hours },
    { label: 'Min', value: parts.minutes },
    { label: 'Sec', value: parts.seconds },
  ]

  if (parts.total <= 0) {
    return <span className={cn('text-sm font-medium text-muted-foreground', className)}>Sale ended</span>
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)} role="timer" aria-label="Time remaining">
      {cells.map((c) => (
        <div
          key={c.label}
          className="flex min-w-11 flex-col items-center rounded-lg bg-foreground px-1.5 py-1 text-background"
        >
          <span className="text-sm font-bold tabular-nums leading-tight">
            {String(c.value).padStart(2, '0')}
          </span>
          <span className="text-[9px] uppercase tracking-wide opacity-70">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
