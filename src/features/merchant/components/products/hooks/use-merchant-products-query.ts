import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsService } from '@/services/products.service'

export function useMerchantProductsQuery(storeId: string) {
  const queryClient = useQueryClient()

  const productsQ = useQuery({
    queryKey: ['merchant-products', storeId],
    queryFn: () => productsService.listByStore(storeId),
  })

  const invalidateProducts = () =>
    queryClient.invalidateQueries({
      queryKey: ['merchant-products', storeId],
    })

  return {
    productsQ,
    invalidateProducts,
  }
}
