import toast from 'react-hot-toast'
import { productsService } from '@/services/products.service'
import { getErrorMessage } from '@/lib/utils'
import type { Product } from '@/types'
import type { ProductBulkAction } from '../products.types'

interface UseProductActionsOptions {
  invalidateProducts: () => Promise<unknown>
  clearSelection: () => void
}

export function useProductActions({ invalidateProducts, clearSelection }: UseProductActionsOptions) {
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
      clearSelection()
      await invalidateProducts()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const duplicateProduct = (product: Product) => {
    const {
      id: _id,
      slug: _slug,
      rating: _rating,
      ratingCount: _ratingCount,
      soldCount: _soldCount,
      viewCount: _viewCount,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      publishedAt: _publishedAt,
      rejectionReason: _rejectionReason,
      ...rest
    } = product

    return run(
      () =>
        productsService.create({
          ...rest,
          name: `${product.name} (copy)`,
          status: 'draft',
          flashSale: null,
          featured: false,
          trending: false,
          recommended: false,
        }),
      'Product duplicated as draft',
    )
  }

  const submitProduct = (productId: string) =>
    run(() => productsService.submitForReview(productId), 'Submitted for review')

  const archiveProduct = (productId: string) =>
    run(() => productsService.update(productId, { status: 'archived' }), 'Product archived')

  const unarchiveProduct = (productId: string) =>
    run(() => productsService.update(productId, { status: 'draft' }), 'Product unarchived')

  const deleteProduct = (productId: string) => run(() => productsService.remove(productId), 'Product deleted')

  const runBulkAction = (action: ProductBulkAction, selected: Set<string>) => {
    const ids = [...selected]

    return run(
      () =>
        Promise.all(
          ids.map((id) =>
            action === 'archive'
              ? productsService.update(id, { status: 'archived' })
              : productsService.submitForReview(id),
          ),
        ),
      action === 'archive'
        ? `Archived ${ids.length} products`
        : `Submitted ${ids.length} products for review`,
    )
  }

  const deleteSelectedProducts = (selected: Set<string>) => {
    const ids = [...selected]

    return run(
      () => Promise.all(ids.map((id) => productsService.remove(id))),
      `Deleted ${ids.length} products`,
    )
  }

  return {
    duplicateProduct,
    submitProduct,
    archiveProduct,
    unarchiveProduct,
    deleteProduct,
    runBulkAction,
    deleteSelectedProducts,
  }
}
