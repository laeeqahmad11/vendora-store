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

export default function ProfilePage() {
  const { firebaseUser, profile, refreshProfile } = useAuthStore()
  const [displayName, setDisplayName] = React.useState(profile?.displayName ?? '')
  const [phone, setPhone] = React.useState(profile?.phone ?? '')
  const [photos, setPhotos] = React.useState<string[]>(profile?.photoURL ? [profile.photoURL] : [])

  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName)
      setPhone(profile.phone ?? '')
      setPhotos(profile.photoURL ? [profile.photoURL] : [])
    }
  }, [profile])

  const save = useMutation({
    mutationFn: () =>
      authService.updateProfileData(firebaseUser!.uid, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        photoURL: photos[0] ?? '',
      }),
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Profile updated')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const resend = useMutation({
    mutationFn: () => authService.resendVerification(),
    onSuccess: () => toast.success('Verification email sent — check your inbox.'),
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-6">
      <SEO title="My profile" />

      {firebaseUser && !firebaseUser.emailVerified && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <MailWarning className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Verify your email address</p>
            <p className="text-xs text-muted-foreground">
              We sent a verification link to {firebaseUser.email}. Didn't get it?
            </p>
          </div>
          <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate()}>
            Resend email
          </Button>
        </div>
      )}

      <Card className="p-6">
        <h2 className="font-semibold">Profile details</h2>
        <form
          className="mt-5 max-w-lg space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!displayName.trim()) return toast.error('Display name cannot be empty.')
            save.mutate()
          }}
        >
          <FormField label="Profile photo">
            <ImageUploader value={photos} onChange={(urls) => setPhotos(urls.slice(-1))} folder={`avatars/${firebaseUser?.uid}`} max={1} />
          </FormField>
          <FormField label="Display name" required>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
          </FormField>
          <FormField label="Phone" hint="Used to contact you about deliveries">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" />
          </FormField>
          <FormField label="Email" hint="Email cannot be changed here">
            <Input value={profile?.email ?? ''} disabled />
          </FormField>
          <Button type="submit" loading={save.isPending}>
            <Save /> Save changes
          </Button>
        </form>
      </Card>
    </div>
  )
}
