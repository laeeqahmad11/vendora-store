import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MailWarning, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { SEO } from '@/components/shared/seo'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth-store'
import { getErrorMessage } from '@/lib/utils'

const DISPLAY_NAME_MIN_LENGTH = 2
const DISPLAY_NAME_MAX_LENGTH = 50
const PHONE_MIN_LENGTH = 10
const PHONE_MAX_LENGTH = 15

export default function ProfilePage() {
  const { firebaseUser, profile, refreshProfile } = useAuthStore()

  const [displayName, setDisplayName] = React.useState(
    profile?.displayName ?? '',
  )

  const [phone, setPhone] = React.useState(profile?.phone ?? '')

  const [photos, setPhotos] = React.useState<string[]>(
    profile?.photoURL ? [profile.photoURL] : [],
  )

  React.useEffect(() => {
    if (!profile) return

    setDisplayName(profile.displayName ?? '')
    setPhone(profile.phone ?? '')
    setPhotos(profile.photoURL ? [profile.photoURL] : [])
  }, [profile])

  const save = useMutation({
    mutationFn: async () => {
      if (!firebaseUser?.uid) {
        throw new Error('You must be signed in to update your profile.')
      }

      const cleanDisplayName = displayName.trim()
      const cleanPhone = phone.trim()

      return authService.updateProfileData(firebaseUser.uid, {
        displayName: cleanDisplayName,
        phone: cleanPhone,
        photoURL: photos[0] ?? '',
      })
    },

    onSuccess: async () => {
      await refreshProfile()
      toast.success('Profile updated')
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const resend = useMutation({
    mutationFn: () => authService.resendVerification(),

    onSuccess: () => {
      toast.success('Verification email sent — check your inbox.')
    },

    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const handleDisplayNameChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value

    // Allow letters, numbers and spaces only.
    const cleanedValue = value
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .slice(0, DISPLAY_NAME_MAX_LENGTH)

    setDisplayName(cleanedValue)
  }

  const handlePhoneChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    // Remove letters, spaces and special characters.
    const digitsOnly = event.target.value
      .replace(/\D/g, '')
      .slice(0, PHONE_MAX_LENGTH)

    setPhone(digitsOnly)
  }

  const validateForm = () => {
    const cleanDisplayName = displayName.trim()
    const cleanPhone = phone.trim()

    if (!cleanDisplayName) {
      toast.error('Display name cannot be empty.')
      return false
    }

    if (cleanDisplayName.length < DISPLAY_NAME_MIN_LENGTH) {
      toast.error(
        `Display name must contain at least ${DISPLAY_NAME_MIN_LENGTH} characters.`,
      )
      return false
    }

    if (cleanDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
      toast.error(
        `Display name cannot exceed ${DISPLAY_NAME_MAX_LENGTH} characters.`,
      )
      return false
    }

    if (!/^[a-zA-Z0-9 ]+$/.test(cleanDisplayName)) {
      toast.error(
        'Display name can only contain letters, numbers and spaces.',
      )
      return false
    }

    if (
      cleanPhone &&
      !new RegExp(
        `^\\d{${PHONE_MIN_LENGTH},${PHONE_MAX_LENGTH}}$`,
      ).test(cleanPhone)
    ) {
      toast.error(
        `Phone number must contain ${PHONE_MIN_LENGTH} to ${PHONE_MAX_LENGTH} digits.`,
      )
      return false
    }

    return true
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) return

    save.mutate()
  }

  return (
    <div className="space-y-6">
      <SEO title="My profile" />

      {firebaseUser && !firebaseUser.emailVerified && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <MailWarning className="size-5 shrink-0 text-warning" />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Verify your email address
            </p>

            <p className="text-xs text-muted-foreground">
              We sent a verification link to {firebaseUser.email}.
              Didn&apos;t get it?
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={resend.isPending}
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            Resend email
          </Button>
        </div>
      )}

      <Card className="p-6">
        <h2 className="font-semibold">Profile details</h2>

        <form
          className="mt-5 max-w-lg space-y-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <FormField label="Profile photo">
            <ImageUploader
              value={photos}
              onChange={(urls) => {
                setPhotos(urls.slice(-1))
              }}
              folder={`avatars/${firebaseUser?.uid ?? 'unknown-user'}`}
              max={1}
            />
          </FormField>

          <FormField
            label="Display name"
            hint="2 to 50 characters — letters, numbers and spaces only"
            required
          >
            <Input
              value={displayName}
              onChange={handleDisplayNameChange}
              placeholder="Enter your display name"
              autoComplete="name"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              disabled={save.isPending}
            />
          </FormField>

          <FormField
            label="Phone"
            hint="Optional — enter 10 to 15 digits, e.g. 03001234567"
          >
            <Input
              value={phone}
              onChange={handlePhoneChange}
              type="tel"
              inputMode="numeric"
              placeholder="03001234567"
              autoComplete="tel"
              maxLength={PHONE_MAX_LENGTH}
              disabled={save.isPending}
            />
          </FormField>

          <FormField
            label="Email"
            hint="Email cannot be changed here"
          >
            <Input
              value={profile?.email ?? firebaseUser?.email ?? ''}
              type="email"
              disabled
              readOnly
            />
          </FormField>

          <Button
            type="submit"
            loading={save.isPending}
            disabled={save.isPending}
          >
            <Save className="size-4" />
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  )
}