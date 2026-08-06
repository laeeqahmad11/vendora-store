import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/lib/utils'
import { productsService } from '@/services/products.service'
import { getProductCsvDrafts } from '../product-csv.utils'

interface UseProductCsvImportOptions {
  storeId: string
  actorId: string
  invalidateProducts: () => Promise<unknown>
  onImported: () => void
}

export function useProductCsvImport({
  storeId,
  actorId,
  invalidateProducts,
  onImported,
}: UseProductCsvImportOptions) {
  return useMutation({
    mutationFn: async (text: string) => {
      const drafts = getProductCsvDrafts(text, storeId, actorId)
      let created = 0

      for (const draft of drafts) {
        await productsService.create(draft)
        created++
      }

      return created
    },

    onSuccess: async (created) => {
      toast.success(`Imported ${created} draft product${created === 1 ? '' : 's'}.`)

      onImported()
      await invalidateProducts()
    },

    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
