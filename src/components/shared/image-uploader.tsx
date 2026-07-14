import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { storageService } from '@/services/storage.service'

interface ImageUploaderProps {
  value: string[]
  onChange: (urls: string[]) => void
  folder: string
  max?: number
  className?: string
}

/** Drag-and-drop multi-image uploader with client-side compression */
export function ImageUploader({ value, onChange, folder, max = 8, className }: ImageUploaderProps) {
  const [uploading, setUploading] = React.useState(false)

  const onDrop = React.useCallback(
    async (accepted: File[]) => {
      const remaining = max - value.length
      const files = accepted.slice(0, remaining)
      if (!files.length) return
      setUploading(true)
      try {
        const urls = await Promise.all(files.map((f) => storageService.uploadImage(f, folder)))
        onChange([...value, ...urls])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Image upload failed. Please try a smaller image.')
        console.error(e)
      } finally {
        setUploading(false)
      }
    },
    [value, onChange, folder, max],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: uploading || value.length >= max,
  })

  return (
    <div className={cn('space-y-3', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          (uploading || value.length >= max) && 'pointer-events-none opacity-60',
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <ImagePlus className="size-6 text-muted-foreground" />
        )}
        <p className="text-sm text-muted-foreground">
          {uploading
            ? 'Uploading…'
            : value.length >= max
              ? `Maximum ${max} images`
              : 'Drag & drop images here, or click to browse'}
        </p>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {value.map((url, i) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border">
              <img src={url} alt={`Upload ${i + 1}`} className="size-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  Cover
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
