import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/10">
        <Compass className="size-10 text-primary" />
      </div>
      <p className="text-6xl font-black tracking-tight text-primary">404</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you're looking for doesn't exist or was moved. Let's get you back on track.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/shop">Browse products</Link>
        </Button>
      </div>
    </div>
  )
}
