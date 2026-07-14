import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { LifeBuoy, Send } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/misc'
import { supportService } from '@/services/support.service'
import { cn, formatDate, getErrorMessage, timeAgo } from '@/lib/utils'
import type { SupportTicket } from '@/types'
import { useAdminActor } from '../components/hooks'

type TicketStatus = SupportTicket['status']

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-warning/15 text-warning',
  in_progress: 'bg-primary/15 text-primary',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-muted text-muted-foreground',
}

const PRIORITY_VARIANT: Record<SupportTicket['priority'], 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
}

export default function SupportTicketsPage() {
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const ticketsQ = useQuery({ queryKey: ['admin-tickets'], queryFn: () => supportService.listAll() })
  const tickets = (ticketsQ.data ?? []).filter((t) => statusFilter === 'all' || t.status === statusFilter)
  const selected = (ticketsQ.data ?? []).find((t) => t.id === selectedId) ?? null

  return (
    <div>
      <PageHeader
        title="Support"
        description="Customer support tickets across the platform."
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {ticketsQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No tickets" description="Customer tickets will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedId(t.id)}>
                <TableCell className="max-w-64">
                  <span className="block truncate font-medium">{t.subject}</span>
                  {t.orderId && <span className="text-xs text-muted-foreground">Order: {t.orderId}</span>}
                </TableCell>
                <TableCell>
                  <span className="block">{t.customerName}</span>
                  <span className="text-xs text-muted-foreground">{t.customerEmail}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[t.priority]} className="capitalize">
                    {t.priority}
                  </Badge>
                </TableCell>
                <TableCell>{t.messages.length}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(t.updatedAt)}</TableCell>
                <TableCell>
                  <span
                    className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[t.status])}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selected && <TicketDialog ticket={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function TicketDialog({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
  const actor = useAdminActor()
  const qc = useQueryClient()
  const [reply, setReply] = React.useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-tickets'] })

  const replyMut = useMutation({
    mutationFn: (text: string) => supportService.addMessage(ticket.id, actor.id, actor.name, text),
    onSuccess: () => {
      invalidate()
      setReply('')
      toast.success('Reply sent')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const statusMut = useMutation({
    mutationFn: (status: TicketStatus) => supportService.setStatus(ticket.id, status),
    onSuccess: () => {
      invalidate()
      toast.success('Status updated')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{ticket.subject}</DialogTitle>
          <DialogDescription>
            {ticket.customerName} ({ticket.customerEmail}) · opened {formatDate(ticket.createdAt, 'MMM D, YYYY h:mm A')}
            {ticket.orderId ? ` · order ${ticket.orderId}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Select
            value={ticket.status}
            onValueChange={(v) => statusMut.mutate(v as TicketStatus)}
            disabled={statusMut.isPending}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
          {ticket.messages.map((msg, i) => {
            const isAdmin = msg.senderId === actor.id || msg.senderId !== ticket.customerId
            return (
              <div key={i} className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                    isAdmin ? 'bg-primary text-primary-foreground' : 'bg-card border',
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <p className={cn('mt-1 text-[10px]', isAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {msg.senderName} · {timeAgo(msg.at)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply to the customer…"
            className="min-h-20"
          />
          <div className="flex justify-end">
            <Button
              disabled={!reply.trim()}
              loading={replyMut.isPending}
              onClick={() => replyMut.mutate(reply.trim())}
            >
              <Send /> Send reply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
