import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
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
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/misc'
import { activityService } from '@/services/activity.service'
import { timeAgo } from '@/lib/utils'
import type { UserRole } from '@/types'

const TARGET_TYPES = ['store', 'product', 'order', 'user', 'review', 'coupon'] as const

const ROLE_VARIANT: Record<UserRole, 'destructive' | 'success' | 'default'> = {
  admin: 'destructive',
  merchant: 'success',
  customer: 'default',
}

export default function ActivityLogPage() {
  const [targetType, setTargetType] = React.useState<string>('all')

  const logsQ = useQuery({
    queryKey: ['admin-activity', 200, targetType],
    queryFn: () => activityService.list(200, targetType === 'all' ? undefined : targetType),
  })

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Audit trail of platform actions."
        actions={
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Target type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {TARGET_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {logsQ.isLoading ? (
        <TableSkeleton rows={10} />
      ) : (logsQ.data ?? []).length === 0 ? (
        <EmptyState icon={History} title="No activity recorded" description="Actions across the platform show up here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Actor</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logsQ.data ?? []).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium">{log.actorName}</TableCell>
                <TableCell>
                  <Badge variant={ROLE_VARIANT[log.actorRole]} className="capitalize">
                    {log.actorRole}
                  </Badge>
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.action}</code>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="capitalize">{log.targetType}</span>{' '}
                  <span className="text-xs text-muted-foreground">{log.targetId.slice(0, 8)}…</span>
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{log.detail || '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(log.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
