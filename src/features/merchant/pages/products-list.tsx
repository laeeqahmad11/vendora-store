import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { TableSkeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/layouts/dashboard-layout'
import type { Product } from '@/types'
import { ErrorState, downloadCsv, useMerchant } from '../components/common'
import { useMerchantProductsQuery } from '../components/products/hooks/use-merchant-products-query'
import { useProductActions } from '../components/products/hooks/use-product-actions'
import { useProductCsvImport } from '../components/products/hooks/use-product-csv-import'
import { useProductSelection } from '../components/products/hooks/use-product-selection'
import { useProductsListState } from '../components/products/hooks/use-products-list-state'
import { ImportProductsDialog } from '../components/products/list/import-products-dialog'
import { ProductDeleteDialogs } from '../components/products/list/product-delete-dialogs'
import { ProductsBulkActionBar } from '../components/products/list/products-bulk-action-bar'
import { ProductsEmptyState } from '../components/products/list/products-empty-state'
import { ProductsPageActions } from '../components/products/list/products-page-actions'
import { ProductsResultCount } from '../components/products/list/products-result-count'
import { ProductsSummaryCards } from '../components/products/list/products-summary-cards'
import { ProductsTable } from '../components/products/list/products-table'
import { ProductsToolbar } from '../components/products/list/products-toolbar'
import { getProductCsvExportRows } from '../components/products/product-csv.utils'
import { PRODUCT_CSV_EXPORT_COLUMNS } from '../components/products/products.constants'

export default function ProductsListPage() {
  const { store, actor } = useMerchant()
  const navigate = useNavigate()
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)

  const { productsQ, invalidateProducts } = useMerchantProductsQuery(store.id)
  const products = productsQ.data ?? []

  const { tab, setTab, search, setSearch, lowStockOnly, setLowStockOnly, counts, visible, clearFilters } =
    useProductsListState(products)

  const { selected, toggleSelect, allVisibleSelected, toggleSelectAll, clearSelection } =
    useProductSelection(visible)

  const {
    duplicateProduct,
    submitProduct,
    archiveProduct,
    unarchiveProduct,
    deleteProduct,
    runBulkAction,
    deleteSelectedProducts,
  } = useProductActions({
    invalidateProducts,
    clearSelection,
  })

  const importMutation = useProductCsvImport({
    storeId: store.id,
    actorId: actor.id,
    invalidateProducts,
    onImported: () => setImportOpen(false),
  })

  const exportCsv = () => {
    downloadCsv(`products-${store.slug}.csv`, PRODUCT_CSV_EXPORT_COLUMNS, getProductCsvExportRows(visible))

    toast.success(`Exported ${visible.length} products.`)
  }

  if (productsQ.isError) {
    return <ErrorState onRetry={() => void productsQ.refetch()} />
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Products"
        description="Manage your catalog, stock and product approvals."
        actions={
          <ProductsPageActions
            exportDisabled={visible.length === 0}
            onImport={() => setImportOpen(true)}
            onExport={exportCsv}
          />
        }
      />

      <ProductsSummaryCards
        counts={counts}
        tab={tab}
        lowStockOnly={lowStockOnly}
        onTabChange={setTab}
        onLowStockOnlyChange={setLowStockOnly}
      />

      <ProductsToolbar
        tab={tab}
        search={search}
        counts={counts}
        onTabChange={setTab}
        onSearchChange={setSearch}
        onLowStockOnlyChange={setLowStockOnly}
      />

      <ProductsBulkActionBar
        selectedCount={selected.size}
        onClear={clearSelection}
        onSubmit={() => void runBulkAction('submit', selected)}
        onArchive={() => void runBulkAction('archive', selected)}
        onDelete={() => setBulkDeleteOpen(true)}
      />

      {productsQ.isLoading ? (
        <TableSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <ProductsEmptyState
          search={search}
          tab={tab}
          lowStockOnly={lowStockOnly}
          onClearFilters={clearFilters}
        />
      ) : (
        <ProductsTable
          products={visible}
          selected={selected}
          allVisibleSelected={allVisibleSelected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onEdit={(productId) => navigate(`/merchant/products/${productId}/edit`)}
          onDuplicate={(product) => void duplicateProduct(product)}
          onSubmit={(productId) => void submitProduct(productId)}
          onArchive={(productId) => void archiveProduct(productId)}
          onUnarchive={(productId) => void unarchiveProduct(productId)}
          onDelete={setDeleteTarget}
        />
      )}

      {!productsQ.isLoading && (
        <ProductsResultCount visibleCount={visible.length} totalCount={products.length} />
      )}

      <ProductDeleteDialogs
        deleteTarget={deleteTarget}
        bulkDeleteOpen={bulkDeleteOpen}
        selectedCount={selected.size}
        onDeleteTargetChange={setDeleteTarget}
        onBulkDeleteOpenChange={setBulkDeleteOpen}
        onDeleteProduct={async () => {
          if (!deleteTarget) return

          await deleteProduct(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onDeleteSelected={() => deleteSelectedProducts(selected)}
      />

      <ImportProductsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(text) => importMutation.mutate(text)}
        importing={importMutation.isPending}
      />
    </div>
  )
}
