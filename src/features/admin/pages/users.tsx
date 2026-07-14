import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MoreHorizontal, ShieldAlert, Users as UsersIcon } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { usersService } from '@/services/users.service'
import { activityService } from '@/services/activity.service'
import { formatDate, getErrorMessage } from '@/lib/utils'
import type { UserProfile, UserRole } from '@/types'
import { useAdminActor } from '../components/hooks'

const TABS: { value: UserRole | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'merchant', label: 'Merchants' },
  { value: 'admin', label: 'Admins' },
]

const ROLE_BADGE: Record<UserRole, 'default' | 'success' | 'destructive'> = {
  admin: 'destructive',
  merchant: 'success',
  customer: 'default',
}

export default function UsersPage() {
  const actor = useAdminActor()
  const qc = useQueryClient()
  const [viewing, setViewing] = React.useState<UserProfile | null>(null)
  const [changingRole, setChangingRole] = React.useState<UserProfile | null>(null)
  const [suspending, setSuspending] = React.useState<UserProfile | null>(null)

  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => usersService.list(undefined, 500) })
  const users = usersQ.data ?? []

  const suspendMut = useMutation({
    mutationFn: async (user: UserProfile) => {
      await usersService.setSuspended(user.id, !user.suspended)
      await activityService.log(
        actor,
        user.suspended ? 'user.unsuspended' : 'user.suspended',
        'user',
        user.id,
        user.email,
      )
    },
    onSuccess: (_d, user) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(user.suspended ? 'Account unsuspended' : 'Account suspended')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div>
      <PageHeader title="Users" description="Manage accounts, roles and suspensions." />
      <Tabs defaultValue="all">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => {
          const rows = tab.value === 'all' ? users : users.filter((u) => u.role === tab.value)
          return (
            <TabsContent key={tab.value} value={tab.value}>
              {usersQ.isLoading ? (
                <TableSkeleton rows={8} />
              ) : rows.length === 0 ? (
                <EmptyState icon={UsersIcon} title="No users here" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <span className="flex items-center gap-3 font-medium">
                            <Avatar src={user.photoURL} name={user.displayName} />
                            {user.displayName || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={ROLE_BADGE[user.role]} className="capitalize">
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="success">Active</Badge>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Actions">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewing(user)}>View profile</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setChangingRole(user)} disabled={user.id === actor.id}>
                                Change role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setSuspending(user)}
                                disabled={user.id === actor.id}
                                className="text-destructive"
                              >
                                {user.suspended ? 'Unsuspend' : 'Suspend'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      {viewing && <ProfileDialog user={viewing} onClose={() => setViewing(null)} />}
      {changingRole && <ChangeRoleDialog user={changingRole} onClose={() => setChangingRole(null)} />}
      <ConfirmDialog
        open={!!suspending}
        onOpenChange={(o) => !o && setSuspending(null)}
        title={suspending?.suspended ? `Unsuspend ${suspending?.displayName}?` : `Suspend ${suspending?.displayName}?`}
        description={
          suspending?.suspended
            ? 'The account regains full access to the platform.'
            : 'The account is locked out of the platform until unsuspended.'
        }
        confirmLabel={suspending?.suspended ? 'Unsuspend' : 'Suspend'}
        destructive={!suspending?.suspended}
        onConfirm={() =>
          suspending ? suspendMut.mutateAsync(suspending).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function ProfileDialog({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar src={user.photoURL} name={user.displayName} className="size-11" />
            {user.displayName}
          </DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Role:</span>{' '}
            <Badge variant={ROLE_BADGE[user.role]} className="capitalize">
              {user.role}
            </Badge>
          </p>
          <p>
            <span className="text-muted-foreground">Status:</span> {user.suspended ? 'Suspended' : 'Active'}
          </p>
          <p>
            <span className="text-muted-foreground">Phone:</span> {user.phone || '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Email verified:</span> {user.emailVerified ? 'Yes' : 'No'}
          </p>
          {user.storeId && (
            <p>
              <span className="text-muted-foreground">Store ID:</span> {user.storeId}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Joined:</span> {formatDate(user.createdAt, 'MMM D, YYYY h:mm A')}
          </p>
          <p>
            <span className="text-muted-foreground">User ID:</span> <span className="break-all">{user.id}</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ChangeRoleDialog({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const actor = useAdminActor()
  const qc = useQueryClient()
  const [role, setRole] = React.useState<UserRole>(user.role)

  const roleMut = useMutation({
    mutationFn: async () => {
      await usersService.setRole(user.id, role)
      await activityService.log(actor, 'user.role_changed', 'user', user.id, `${user.email} → ${role}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(`Role changed to ${role}`)
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change role — {user.displayName}</DialogTitle>
          <DialogDescription>Current role: {user.role}</DialogDescription>
        </DialogHeader>
        <FormField label="New role">
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="merchant">Merchant</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Changing a role immediately changes what this account can access. Granting <strong>admin</strong> gives
            full control over the platform.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={role === user.role} loading={roleMut.isPending} onClick={() => roleMut.mutate()}>
            Change role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
