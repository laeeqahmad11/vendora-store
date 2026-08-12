# Variant inventory migration plan

This plan is intentionally dry-run only. It must not be pointed at production until its report has been reviewed, the application and Functions changes are deployed together, and a maintenance/rollback plan is approved.

## Target invariant

- Products with no non-empty `variants` array use `product.stock` as their one authoritative pool.
- Products with variants use each `variant.stock` as authoritative and require `product.stock === sum(variant.stock)`.
- Variant IDs are unique, stable, non-empty strings. Each variant has a unique, non-empty option combination and a non-negative integer stock.
- Checkout fails closed for variant products that do not satisfy the invariant. Product approval also refuses malformed variant inventory.
- Orders created after this change snapshot `inventoryAuthority: "variant" | "product"`. Older orders retain legacy product-pool cancellation semantics.

## Dry-run classifications

Read products without writing and place every document in exactly one class:

1. `non_variant_valid`: variants absent, null, or empty; top-level stock is a non-negative integer.
2. `variant_valid`: all variant records are well formed and top-level stock equals their sum.
3. `variant_missing_stock`: at least one variant has no non-negative integer stock.
4. `variant_aggregate_mismatch`: variants are otherwise valid but top-level stock differs from their sum.
5. `variant_duplicate_id`: two variants share an ID.
6. `variant_duplicate_combination`: normalized, sorted option entries describe the same combination twice.
7. `variant_malformed`: invalid IDs/options, a non-array variants value, unsafe totals, or more than the supported 500 variants.
8. `non_variant_invalid_stock`: no variants and invalid top-level stock.

The report should include document path, store/merchant, publication status, current top-level stock, calculated variant total, issue codes, and a proposed action. It must not include customer or order data.

## Proposed backfill rules

- `non_variant_valid`: no change.
- `variant_valid`: no change.
- `variant_aggregate_mismatch`: set only top-level stock to the variant sum. Variant stocks win because they were independently editable and visible in the existing product form.
- `variant_missing_stock`: do not guess. Archive or make the product non-public until the merchant supplies explicit stock for every variant.
- Duplicate IDs/combinations or malformed variants: do not auto-merge or rename. Make the product non-public and send it to a merchant repair queue; merging could assign existing carts/orders to the wrong inventory pool.
- Invalid non-variant stock: make the product non-public and require merchant repair.

Every proposed write should have a precondition on the document update time captured by the dry run. Apply in small batches, recompute the invariant after each batch, and retain an immutable before/after manifest for rollback. Do not rewrite existing orders.

## Rollout and verification

1. Run the classifier against an exported/staged copy first; confirm it has no credentials or path to production writes.
2. Review counts and every ambiguous/malformed product with operations.
3. Deploy rules, Functions, and web application as one coordinated release before any production backfill.
4. Pause affected variant listings or schedule a short inventory maintenance window.
5. Re-run dry-run with update-time preconditions, then execute only reviewed aggregate-mismatch repairs.
6. Verify random samples and all repaired products satisfy the invariant and storefront selection agrees with checkout.
7. Monitor checkout `failed-precondition` rates and inventory adjustment failures; roll back the application release and restore the before manifest if unexpected divergence appears.

