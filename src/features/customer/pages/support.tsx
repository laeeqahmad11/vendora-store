import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronDown, LifeBuoy, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { SEO } from '@/components/shared/seo'
import { supportService } from '@/services/support.service'
import { useAuthStore } from '@/stores/auth-store'
import { cn, formatDate, getErrorMessage, timeAgo } from '@/lib/utils'
import type { SupportTicket } from '@/types'

const STATUS_BADGE: Record<SupportTicket['status'], { label: string; variant: 'default' | 'warning' | 'success' | 'secondary' }> = {
  open: { label: 'Open', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'secondary' },
}

function TicketThread({ ticket }: { ticket: SupportTicket }) {
  const { firebaseUser, profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [reply, setReply] = React.useState('')

  const send = useMutation({
    mutationFn: () =>
      supportService.addMessage(ticket.id, firebaseUser!.uid, profile?.displayName ?? 'Customer', reply.trim()),
    onSuccess: () => {
      setReply('')
      void queryClient.invalidateQueries({ queryKey: ['support', firebaseUser?.uid] })
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const canReply = ticket.status !== 'closed'

  return (
    <div className="border-t bg-muted/30 px-5 py-4">
      <div className="space-y-3">
        {ticket.messages.map((m, i) => {
          const mine = m.senderId === firebaseUser?.uid
          return (
            <div key={i} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-3.5 py-2 text-sm',
                  mine ? 'bg-primary text-primary-foreground' : 'border bg-card',
                )}
              >
                <p className={cn('text-[11px] font-semibold', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {m.senderName} · {timeAgo(m.at)}
                </p>
                <p className="mt-0.5 whitespace-pre-line">{m.text}</p>
              </div>
            </div>
          )
        })}
      </div>

      {canReply ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (reply.trim()) send.mutate()
          }}
        >
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            aria-label="Reply to ticket"
          />
          <Button type="submit" size="icon" aria-label="Send reply" loading={send.isPending}>
            <Send />
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">This ticket is closed.</p>
      )}
    </div>
  )
}

export default function SupportPage() {
  const { firebaseUser, profile } = useAuthStore()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [subject, setSubject] = React.useState('')
  const [orderId, setOrderId] = React.useState('')
  const [priority, setPriority] = React.useState<SupportTicket['priority']>('medium')
  const [message, setMessage] = React.useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['support', firebaseUser?.uid],
    queryFn: () => supportService.listByCustomer(firebaseUser!.uid),
    enabled: !!firebaseUser,
  })

  const create = useMutation({
    mutationFn: () =>
      supportService.create({
        customerId: firebaseUser!.uid,
        customerName: profile?.displayName ?? 'Customer',
        customerEmail: profile?.email ?? firebaseUser!.email ?? '',
        orderId: orderId.trim() || undefined,
        subject: subject.trim(),
        priority,
        message: message.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['support', firebaseUser?.uid] })
      setCreateOpen(false)
      setSubject('')
      setOrderId('')
      setPriority('medium')
      setMessage('')
      toast.success('Ticket created — we will get back to you soon.')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div>
      <SEO title="Support" />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Support tickets</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> New ticket
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : isError ? (
        <EmptyState
          icon={LifeBuoy}
          title="Couldn't load tickets"
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : !data?.length ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets"
          description="Need help with an order or your account? Open a ticket and we'll get back to you."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Open a ticket
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((ticket) => {
            const badge = STATUS_BADGE[ticket.status]
            const expanded = expandedId === ticket.id
            return (
              <Card key={ticket.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : ticket.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(ticket.createdAt)} · {ticket.messages.length} message
                      {ticket.messages.length === 1 ? '' : 's'}
                      {ticket.orderId && ` · Order ${ticket.orderId}`}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && <TicketThread ticket={ticket} />}
              </Card>
            )
          })}
        </div>
      )}

      {/* Create ticket dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support ticket</DialogTitle>
            <DialogDescription>Describe your issue and our team will respond as soon as possible.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!subject.trim() || !message.trim()) {
                toast.error('Please fill in a subject and a message.')
                return
              }
              create.mutate()
            }}
          >
            <FormField label="Subject" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Related order ID" hint="Optional">
                <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. VND-8F3K2Q" />
              </FormField>
              <FormField label="Priority">
                <Select value={priority} onValueChange={(v) => setPriority(v as SupportTicket['priority'])}>
                  <SelectTrigger aria-label="Ticket priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Message" required>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's going on…"
                className="min-h-28"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
