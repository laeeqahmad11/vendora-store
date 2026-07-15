import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { Info, KeyRound, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { SEO } from '@/components/shared/seo'
import { auth } from '@/lib/firebase'
import { authService } from '@/services/auth.service'
import { getErrorMessage } from '@/lib/utils'

export default function SecurityPage() {
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  const isPasswordUser =
    auth.currentUser?.providerData.some(
      (provider) => provider.providerId === 'password',
    ) ?? false

  const changePassword = useMutation({
    mutationFn: async () => {
      const user = auth.currentUser

      if (!user?.email) {
        throw new Error('You must be signed in.')
      }

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      )

      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
    },

    onSuccess: () => {
      toast.success('Password updated')

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const signOut = useMutation({
    mutationFn: () => authService.logout(),

    onSuccess: () => {
      toast.success('Signed out')
      navigate('/')
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const handlePasswordSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (changePassword.isPending) {
      return
    }

    if (!currentPassword.trim()) {
      toast.error('Current password is required.')
      return
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.')
      return
    }

    if (currentPassword === newPassword) {
      toast.error(
        'New password must be different from the current password.',
      )
      return
    }

    changePassword.mutate()
  }

  return (
    <div className="space-y-6">
      <SEO title="Security" />

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" />
          Change password
        </h2>

        {!isPasswordUser ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            Your account is signed in with Google, so it does not have a
            password to change. Manage your security in your Google account
            settings.
          </p>
        ) : (
          <form
            className="mt-5 max-w-md space-y-4"
            onSubmit={handlePasswordSubmit}
          >
            <FormField label="Current password" required>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
                autoComplete="current-password"
                disabled={changePassword.isPending}
                required
              />
            </FormField>

            <FormField
              label="New password"
              required
              hint="At least 6 characters"
            >
              <Input
                type="password"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                autoComplete="new-password"
                minLength={6}
                disabled={changePassword.isPending}
                required
              />
            </FormField>

            <FormField label="Confirm new password" required>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                autoComplete="new-password"
                minLength={6}
                disabled={changePassword.isPending}
                required
              />
            </FormField>

            <Button
              type="submit"
              loading={changePassword.isPending}
              disabled={changePassword.isPending}
            >
              Update password
            </Button>
          </form>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <LogOut className="size-4 text-primary" />
          Sessions
        </h2>

        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Changing your password automatically signs you out of every other
          device. You can also sign out of this device below.
        </p>

        <Button
          variant="outline"
          className="mt-4"
          loading={signOut.isPending}
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          <LogOut />
          Sign out of this device
        </Button>
      </Card>
    </div>
  )
}