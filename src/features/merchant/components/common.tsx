import * as React from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/misc'
import { useAuthStore } from '@/stores/auth-store'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PRODUCT_STATUS_COLORS,
  PRODUCT_STATUS_LABELS,
} from '@/lib/constants'
import { cn, formatCurrency } from '@/lib/utils'
import type { OrderStatus, Product, ProductStatus, Store, UserRole } from '@/types'

// ------------------------------------------------------------------ hooks

export interface Actor {
  id: string
  name: string
  role: UserRole
}

/**
 * Merchant context — only rendered beneath MerchantGate where the store is
 * guaranteed to exist and be approved.
 */
export function useMerchant(): { store: Store; actor: Actor } {
  const store = useAuthStore((s) => s.store)
  const profile = useAuthStore((s) => s.profile)
  return {
    store: store as Store,
    actor: {
      id: profile?.id ?? '',
      name: profile?.displayName ?? 'Merchant',
      role: profile?.role ?? 'merchant',
    },
  }
}

// ----------------------------------------------------------------- badges

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        ORDER_STATUS_COLORS[status],
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        PRODUCT_STATUS_COLORS[status],
      )}
    >
      {PRODUCT_STATUS_LABELS[status]}
    </span>
  )
}

// ------------------------------------------------------------- ErrorState

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? 'Something went wrong while loading this data. Please try again.'}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------- ProductPicker

/** Searchable multi-select checkbox list for the merchant's own products */
export function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: Product[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = React.useState('')
  const visible = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="h-9 pl-9"
        />
      </div>
      <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border p-2">
        {visible.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">No products found.</p>
        )}
        {visible.map((p) => {
          const checked = value.includes(p.id)
          return (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(c) =>
                  onChange(c === true ? [...value, p.id] : value.filter((id) => id !== p.id))
                }
              />
              {p.images[0] ? (
                <img src={p.images[0]} alt="" className="size-7 rounded object-cover" />
              ) : (
                <span className="size-7 rounded bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">{formatCurrency(p.price)}</span>
            </label>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  )
}

// -------------------------------------------------------------- CSV utils

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined | null)[][],
) {
  const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Minimal RFC-4180-ish CSV parser (handles quoted cells, escaped quotes, CRLF) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
      cur = ''
    } else {
      cur += ch
    }
  }
  row.push(cur)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

// --------------------------------------------------------- datetime utils

/** Epoch ms → value usable in <input type="datetime-local"> */
export function msToLocalInput(ms?: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputToMs(value: string): number | undefined {
  if (!value) return undefined
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : ms
}
