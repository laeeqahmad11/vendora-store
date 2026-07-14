import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, HelpCircle, Newspaper, Pencil, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState, Switch } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { cmsService } from '@/services/cms.service'
import { formatDate, getErrorMessage } from '@/lib/utils'
import type { BlogPost, FAQ } from '@/types'
import { useAdminActor } from '../components/hooks'

export default function CMSPage() {
  return (
    <div>
      <PageHeader title="CMS" description="Blogs, FAQs, static pages and the platform announcement bar." />
      <Tabs defaultValue="blogs">
        <TabsList>
          <TabsTrigger value="blogs">Blogs</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="announcement">Announcement</TabsTrigger>
        </TabsList>
        <TabsContent value="blogs">
          <BlogsTab />
        </TabsContent>
        <TabsContent value="faqs">
          <FAQsTab />
        </TabsContent>
        <TabsContent value="pages">
          <PagesTab />
        </TabsContent>
        <TabsContent value="announcement">
          <AnnouncementTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------- Blogs

function BlogsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<BlogPost | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<BlogPost | null>(null)

  const blogsQ = useQuery({ queryKey: ['admin-blogs'], queryFn: () => cmsService.listBlogs(false) })

  const deleteMut = useMutation({
    mutationFn: (id: string) => cmsService.deleteBlog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-blogs'] })
      toast.success('Post deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New post
        </Button>
      </div>
      {blogsQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : (blogsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No blog posts yet"
          action={<Button onClick={() => setEditing('new')}>Write the first post</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(blogsQ.data ?? []).map((post) => (
              <TableRow key={post.id}>
                <TableCell className="max-w-64">
                  <span className="block truncate font-medium">{post.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{post.excerpt}</span>
                </TableCell>
                <TableCell>{post.author}</TableCell>
                <TableCell className="text-muted-foreground">{post.tags.join(', ') || '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(post.createdAt)}</TableCell>
                <TableCell>
                  {post.published ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(post)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(post)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <BlogDialog post={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.title}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          deleting ? deleteMut.mutateAsync(deleting.id).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function BlogDialog({ post, onClose }: { post: BlogPost | null; onClose: () => void }) {
  const actor = useAdminActor()
  const qc = useQueryClient()
  const [title, setTitle] = React.useState(post?.title ?? '')
  const [excerpt, setExcerpt] = React.useState(post?.excerpt ?? '')
  const [content, setContent] = React.useState(post?.content ?? '')
  const [images, setImages] = React.useState<string[]>(post?.coverUrl ? [post.coverUrl] : [])
  const [tags, setTags] = React.useState(post?.tags.join(', ') ?? '')
  const [published, setPublished] = React.useState(post?.published ?? false)

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        title: title.trim(),
        excerpt: excerpt.trim(),
        content,
        coverUrl: images[0] ?? '',
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        published,
      }
      if (post) await cmsService.updateBlog(post.id, data)
      else await cmsService.createBlog({ ...data, author: actor.name })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-blogs'] })
      toast.success(post ? 'Post updated' : 'Post created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post ? 'Edit post' : 'New post'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Excerpt" hint="Short summary shown on the blog listing.">
            <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className="min-h-16" />
          </FormField>
          <FormField label="Content" required>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-56" />
          </FormField>
          <FormField label="Cover image">
            <ImageUploader value={images} onChange={setImages} folder="blogs" max={1} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tags" hint="Comma-separated.">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="news, tips" />
            </FormField>
            <FormField label="Published">
              <div className="flex h-10 items-center">
                <Switch checked={published} onCheckedChange={setPublished} />
              </div>
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !content.trim()}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {post ? 'Save changes' : 'Create post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------------- FAQs

function FAQsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<FAQ | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<FAQ | null>(null)

  const faqsQ = useQuery({ queryKey: ['admin-faqs'], queryFn: () => cmsService.listFAQs() })

  const deleteMut = useMutation({
    mutationFn: (id: string) => cmsService.deleteFAQ(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-faqs'] })
      toast.success('FAQ deleted')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New FAQ
        </Button>
      </div>
      {faqsQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : (faqsQ.data ?? []).length === 0 ? (
        <EmptyState icon={HelpCircle} title="No FAQs yet" action={<Button onClick={() => setEditing('new')}>New FAQ</Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(faqsQ.data ?? []).map((faq) => (
              <TableRow key={faq.id}>
                <TableCell className="max-w-96">
                  <span className="block truncate font-medium">{faq.question}</span>
                  <span className="block truncate text-xs text-muted-foreground">{faq.answer}</span>
                </TableCell>
                <TableCell>{faq.category || '—'}</TableCell>
                <TableCell>{faq.sortOrder ?? 0}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(faq)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(faq)} aria-label="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <FAQDialog faq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this FAQ?"
        description={deleting?.question}
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          deleting ? deleteMut.mutateAsync(deleting.id).then(() => undefined, () => undefined) : undefined
        }
      />
    </div>
  )
}

function FAQDialog({ faq, onClose }: { faq: FAQ | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [question, setQuestion] = React.useState(faq?.question ?? '')
  const [answer, setAnswer] = React.useState(faq?.answer ?? '')
  const [category, setCategory] = React.useState(faq?.category ?? '')
  const [sortOrder, setSortOrder] = React.useState(String(faq?.sortOrder ?? 0))

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        question: question.trim(),
        answer: answer.trim(),
        category: category.trim(),
        sortOrder: Number(sortOrder) || 0,
      }
      if (faq) await cmsService.updateFAQ(faq.id, data)
      else await cmsService.createFAQ(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-faqs'] })
      toast.success(faq ? 'FAQ updated' : 'FAQ created')
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{faq ? 'Edit FAQ' : 'New FAQ'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Question" required>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
          </FormField>
          <FormField label="Answer" required>
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Shipping" />
            </FormField>
            <FormField label="Sort order">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!question.trim() || !answer.trim()}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {faq ? 'Save changes' : 'Create FAQ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------- Pages

const STATIC_PAGES = [
  { id: 'about', label: 'About Us' },
  { id: 'terms', label: 'Terms & Conditions' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'shipping-policy', label: 'Shipping Policy' },
  { id: 'return-policy', label: 'Return Policy' },
  { id: 'contact', label: 'Contact' },
] as const

function PagesTab() {
  const qc = useQueryClient()
  const [pageId, setPageId] = React.useState<string>('about')
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')

  const pageQ = useQuery({
    queryKey: ['admin-page', pageId],
    queryFn: () => cmsService.getPage(pageId),
  })

  React.useEffect(() => {
    if (pageQ.isLoading) return
    setTitle(pageQ.data?.title ?? STATIC_PAGES.find((p) => p.id === pageId)?.label ?? '')
    setContent(pageQ.data?.content ?? '')
  }, [pageQ.data, pageQ.isLoading, pageId])

  const saveMut = useMutation({
    mutationFn: () => cmsService.savePage(pageId, { title: title.trim(), content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-page', pageId] })
      toast.success('Page saved')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Static pages</CardTitle>
        <CardDescription>Content for the storefront's informational pages.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Page">
          <Select value={pageId} onValueChange={setPageId}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATIC_PAGES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {pageQ.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <FormField label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="Content" required>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-64" />
            </FormField>
            <div className="flex justify-end">
              <Button
                disabled={!title.trim() || !content.trim()}
                loading={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                <FileText /> Save page
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------- Announcement

function AnnouncementTab() {
  const qc = useQueryClient()
  const [text, setText] = React.useState('')
  const [active, setActive] = React.useState(false)

  const settingsQ = useQuery({
    queryKey: ['admin-platform-settings'],
    queryFn: () => cmsService.getPlatformSettings(),
  })

  React.useEffect(() => {
    if (settingsQ.data?.announcement) {
      setText(settingsQ.data.announcement.text)
      setActive(settingsQ.data.announcement.active)
    }
  }, [settingsQ.data])

  const saveMut = useMutation({
    mutationFn: () => cmsService.savePlatformSettings({ announcement: { text: text.trim(), active } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-platform-settings'] })
      toast.success('Announcement saved')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Announcement bar</CardTitle>
        <CardDescription>Shown at the top of the storefront when active.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <FormField label="Announcement text">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Free shipping on orders over $50 this week!"
              />
            </FormField>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Show announcement</p>
                <p className="text-xs text-muted-foreground">Toggle visibility without deleting the text.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex justify-end">
              <Button loading={saveMut.isPending} onClick={() => saveMut.mutate()} disabled={active && !text.trim()}>
                Save announcement
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
