import { Button } from '@/components/ui/button'
import { EmptyState, Spinner } from '@/components/ui/misc'
import { PageHeader } from '@/layouts/dashboard-layout'
import { BasicInformationSection } from '../components/products/form/basic-information-section'
import { FlashSaleSection } from '../components/products/form/flash-sale-section'
import { InventorySection } from '../components/products/form/inventory-section'
import { PricingSection } from '../components/products/form/pricing-section'
import { ProductImagesSection } from '../components/products/form/product-images-section'
import { SeoSection } from '../components/products/form/seo-section'
import { ShippingPoliciesSection } from '../components/products/form/shipping-policies-section'
import { SpecificationsSection } from '../components/products/form/specifications-section'
import { VariantsSection } from '../components/products/form/variants-section'
import { useProductForm } from '../components/products/hooks/use-product-form'

export default function ProductFormPage() {
  const form = useProductForm()

  if (form.isEdit && form.isProductLoading) return <Spinner />
  if (form.isEdit && !form.isProductLoading && !form.product) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been deleted."
        action={<Button onClick={form.navigateToProducts}>Back to products</Button>}
      />
    )
  }
  if (!form.hydrated) return <Spinner />

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((values) => form.save(values, false))}>
      <PageHeader
        title={form.isEdit ? 'Edit product' : 'New product'}
        description={
          form.isEdit
            ? `Editing "${form.product?.name}"${form.status ? ` — status: ${form.status}` : ''}`
            : 'Products go live after admin approval.'
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={form.navigateToProducts}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={form.canSubmitForReview ? 'secondary' : 'default'}
              loading={form.isSubmitting}
            >
              {form.isEdit ? 'Save changes' : 'Save as draft'}
            </Button>
            {form.canSubmitForReview && (
              <Button
                type="button"
                loading={form.isSubmitting}
                onClick={form.handleSubmit((values) => form.save(values, true))}
              >
                Save & submit for review
              </Button>
            )}
          </>
        }
      />

      {form.status === 'rejected' && form.product?.rejectionReason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">Rejected:</span> {form.product.rejectionReason}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <BasicInformationSection
            register={form.register}
            watch={form.watch}
            errors={form.errors}
            categoryId={form.categoryId}
            categories={form.categories}
            subcategories={form.subcategories}
            brands={form.brands}
            onSelectField={form.selectField}
          />
          <ProductImagesSection
            images={form.images}
            onChange={form.changeImages}
            folder={`stores/${form.store.id}/products`}
          />
          <VariantsSection
            optionRows={form.optionRows}
            setOptionRows={form.setOptionRows}
            combos={form.combos}
            variantEdits={form.variantEdits}
            setVariantEdits={form.setVariantEdits}
            markDirty={form.markDirty}
          />
          <SpecificationsSection
            specifications={form.specs}
            setSpecifications={form.setSpecs}
            markDirty={form.markDirty}
          />
          <ShippingPoliciesSection register={form.register} />
        </div>

        <div className="space-y-6">
          <PricingSection register={form.register} errors={form.errors} />
          <InventorySection register={form.register} errors={form.errors} />
          <FlashSaleSection
            register={form.register}
            setValue={form.setValue}
            errors={form.errors}
            active={form.flashSaleActive}
          />
          <SeoSection register={form.register} />
        </div>
      </div>
    </form>
  )
}
