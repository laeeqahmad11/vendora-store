import { cn } from '@/lib/utils'

/** Small pulsing indicator shown next to data that updates in real time */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success',
        className,
      )}
      title="Updates in real time"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      Live
    </span>
  )
}
