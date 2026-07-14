import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { router } from '@/router'
import { initAuthListener } from '@/stores/auth-store'
import { ErrorBoundary } from '@/components/shared/error-boundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  useEffect(() => {
    initAuthListener()
  }, [])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster
          position="top-center"
          toastOptions={{
            className: '!bg-card !text-card-foreground !border !shadow-lg !rounded-xl !text-sm',
          }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
