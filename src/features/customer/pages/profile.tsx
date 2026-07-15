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

const TOAST_IDS = {
  displayNameRequired: 'profile-display-name-required',
  displayNameLength: 'profile-display-name-length',
  displayNameCharacters: 'profile-display-name-characters',
  phoneInvalid: 'profile-phone-invalid',
  updateSuccess: 'profile-update-success',
  updateError: 'profile-update-error',
  verificationSuccess: 'verification-email-success',
  verificationError: 'verification-email-error',
} as const

export default function ProfilePage() {
  const { firebaseUser, profile, refreshProfile } = useAuthStore()

  const [displayName, setDisplayName] = React.useState(
    profile?.displayName ?? '',
  )
  const [phone, setPhone] = React.useState(profile?.phone ?? '')
  const [photos, setPhotos] = React.useState<string[]>(
    profile?.photoURL ? [profile.photoURL] : [],
  )

  /*
   * This ref blocks extremely fast double-clicks before React has time
   * to update save.isPending and disable the button.
   */
  const submittingRef = React.useRef(false)

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

      return authService.updateProfileData(firebaseUser.uid, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        photoURL: photos[0] ?? '',
      })
    },

    onSuccess: async () => {
      await refreshProfile()

      toast.success('Profile updated', {
        id: TOAST_IDS.updateSuccess,
      })
    },

    onError: (error) => {
      toast.error(getErrorMessage(error), {
        id: TOAST_IDS.updateError,
      })
    },

    onSettled: () => {
      submittingRef.current = false
    },
  })

  const resend = useMutation({
    mutationFn: () => authService.resendVerification(),

    onSuccess: () => {
      toast.success('Verification email sent — check your inbox.', {
        id: TOAST_IDS.verificationSuccess,
      })
    },

    onError: (error) => {
      toast.error(getErrorMessage(error), {
        id: TOAST_IDS.verificationError,
      })
    },
  })

  const validateForm = (): boolean => {
    const cleanedDisplayName = displayName.trim()
    const cleanedPhone = phone.trim()

    if (!cleanedDisplayName) {
      toast.error('Display name cannot be empty.', {
        id: TOAST_IDS.displayNameRequired,
      })

      return false
    }

    if (
      cleanedDisplayName.length < DISPLAY_NAME_MIN_LENGTH ||
      cleanedDisplayName.length > DISPLAY_NAME_MAX_LENGTH
    ) {
      toast.error(
        `Display name must contain ${DISPLAY_NAME_MIN_LENGTH} to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
        {
          id: TOAST_IDS.displayNameLength,
        },
      )

      return false
    }

    /*
     * Allows letters, numbers and spaces.
     * Symbols such as @, #, $, %, _, and - are rejected.
     */
    if (!/^[a-zA-Z0-9 ]+$/.test(cleanedDisplayName)) {
      toast.error(
        'Display name can contain letters, numbers and spaces only.',
        {
          id: TOAST_IDS.displayNameCharacters,
        },
      )

      return false
    }

    /*
     * Phone is optional. When entered, it must contain exactly
     * 10 to 15 numeric digits.
     */
    if (
      cleanedPhone &&
      !new RegExp(
        `^\\d{${PHONE_MIN_LENGTH},${PHONE_MAX_LENGTH}}$`,
      ).test(cleanedPhone)
    ) {
      toast.error(
        `Phone number must contain ${PHONE_MIN_LENGTH} to ${PHONE_MAX_LENGTH} digits.`,
        {
          id: TOAST_IDS.phoneInvalid,
        },
      )

      return false
    }

    return true
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    /*
     * Prevent repeated submission while an update is already running.
     */
    if (submittingRef.current || save.isPending) return

    if (!validateForm()) return

    /*
     * Dismiss old validation messages before starting a valid save.
     */
    toast.dismiss(TOAST_IDS.displayNameRequired)
    toast.dismiss(TOAST_IDS.displayNameLength)
    toast.dismiss(TOAST_IDS.displayNameCharacters)
    toast.dismiss(TOAST_IDS.phoneInvalid)
    toast.dismiss(TOAST_IDS.updateError)

    submittingRef.current = true
    save.mutate()
  }

  const handleDisplayNameChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    /*
     * Limit typing to 50 characters.
     * Final character validation still happens during submission.
     */
    setDisplayName(
      event.target.value.slice(0, DISPLAY_NAME_MAX_LENGTH),
    )
  }

  const handlePhoneChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    /*
     * Remove every non-numeric character and limit the input
     * to 15 digits.
     */
    const digitsOnly = event.target.value
      .replace(/\D/g, '')
      .slice(0, PHONE_MAX_LENGTH)

    setPhone(digitsOnly)
  }

  const isSaving = save.isPending || submittingRef.current

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
            onClick={() => {
              if (!resend.isPending) {
                resend.mutate()
              }
            }}
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
              folder={`avatars/${firebaseUser?.uid ?? 'guest'}`}
              max={1}
            />
          </FormField>

          <FormField
            label="Display name"
            required
            hint="2 to 50 characters — letters, numbers and spaces only"
          >
            <Input
              value={displayName}
              onChange={handleDisplayNameChange}
              minLength={DISPLAY_NAME_MIN_LENGTH}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              autoComplete="name"
              placeholder="Enter your display name"
              disabled={isSaving}
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
              autoComplete="tel"
              minLength={PHONE_MIN_LENGTH}
              maxLength={PHONE_MAX_LENGTH}
              placeholder="03001234567"
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label="Email"
            hint="Email cannot be changed here"
          >
            <Input
              value={profile?.email ?? firebaseUser?.email ?? ''}
              disabled
            />
          </FormField>

          <Button
            type="submit"
            loading={save.isPending}
            disabled={isSaving}
          >
            <Save />
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  )
}