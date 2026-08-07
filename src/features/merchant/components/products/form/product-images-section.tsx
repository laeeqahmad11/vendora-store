import { ImageUploader } from '@/components/shared/image-uploader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ProductImagesSectionProps {
  images: string[]
  folder: string
  onChange: (urls: string[]) => void
}

export function ProductImagesSection({ images, folder, onChange }: ProductImagesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Images</CardTitle>
        <CardDescription>First image is the cover. Up to 8 images.</CardDescription>
      </CardHeader>
      <CardContent>
        <ImageUploader value={images} onChange={onChange} folder={folder} />
      </CardContent>
    </Card>
  )
}
