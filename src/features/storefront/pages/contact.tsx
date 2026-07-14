import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Clock, Mail, MapPin, MessageSquare, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/shared/form-field'
import { SEO } from '@/components/shared/seo'
import { supportService } from '@/services/support.service'
import { useAuthStore } from '@/stores/auth-store'
import { getErrorMessage } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'

const CONTACT_CARDS = [
  { icon: Mail, title: 'Email', lines: [`support@${APP_NAME.toLowerCase()}.com`, 'We reply within 24 hours'] },
  { icon: Phone, title: 'Phone', lines: ['+1 (555) 010-2030', 'Mon–Fri, 9am–6pm'] },
  { icon: MapPin, title: 'Office', lines: ['100 Market Street', 'Suite 300, Springfield'] },
  { icon: Clock, title: 'Support hours', lines: ['Monday – Saturday', '9:00 – 18:00'] },
]

export default function ContactPage() {
  const { firebaseUser, profile } = useAuthStore()
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState('')

  const submit = useMutation({
    mutationFn: () =>
      supportService.create({
        customerId: firebaseUser!.uid,
        customerName: profile?.displayName ?? 'Customer',
        customerEmail: profile?.email ?? firebaseUser!.email ?? '',
        subject: subject.trim(),
        priority: 'medium',
        message: message.trim(),
      }),
    onSuccess: () => {
      toast.success('Message sent! We opened a support ticket for you.')
      setSubject('')
      setMessage('')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SEO title="Contact us" description={`Get in touch with the ${APP_NAME} support team.`} />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Contact us</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questions about an order, a store, or selling on {APP_NAME}? We're here to help.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CONTACT_CARDS.map((c) => (
          <Card key={c.title} className="p-5 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <c.icon className="size-5 text-primary" />
            </div>
            <h2 className="mt-3 text-sm font-semibold">{c.title}</h2>
            {c.lines.map((line) => (
              <p key={line} className="mt-0.5 text-xs text-muted-foreground">
                {line}
              </p>
            ))}
          </Card>
        ))}
      </div>

      <Card className="mx-auto mt-10 max-w-2xl p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageSquare className="size-4 text-primary" /> Send us a message
        </h2>
        {!firebaseUser && (
          <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            Please{' '}
            <Link to="/auth/login" className="font-semibold underline">
              sign in
            </Link>{' '}
            to send a message — your ticket will show up in your account's support inbox.
          </p>
        )}
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!firebaseUser) {
              toast.error('Please sign in to contact support.')
              return
            }
            if (!subject.trim() || !message.trim()) {
              toast.error('Please fill in a subject and a message.')
              return
            }
            submit.mutate()
          }}
        >
          <FormField label="Subject" required>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What can we help with?"
              maxLength={120}
            />
          </FormField>
          <FormField label="Message" required>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your question or issue in as much detail as you can…"
              className="min-h-32"
            />
          </FormField>
          <Button type="submit" loading={submit.isPending}>
            Send message
          </Button>
        </form>
      </Card>
    </div>
  )
}
