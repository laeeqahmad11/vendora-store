# Merchant application privacy migration

This is a future production runbook only. Nothing in this repository change
executes a production migration or deploy.

## Data classification

The legacy `stores/{storeId}` document mixed these private application fields
into a document that was anonymously readable:

- `email`
- `phone`
- `address`
- `businessName` (legal business identity)
- `businessDocumentUrl`
- `rejectionReason`

The v2 public store document contains only operational/public profile data:

- `ownerId`, `name`, `slug`, `description`
- `logoUrl`, `bannerUrl`, `socialLinks`, `seo`, `businessHours`
- `status`, `verified`
- `rating`, `ratingCount`, `productCount`, `totalSales`
- `shippingPolicy`, `shippingEnabled`, `shippingFee`,
  `freeShippingThreshold`, `estimatedDeliveryDays`
- `createdAt`, `updatedAt`

Anonymous collection queries use a trusted `publicStores/{storeId}` projection
containing exactly those public fields. Browser writes to that collection are
denied. Direct reads of `stores/{storeId}` are public only when the document is
approved and passes the same public-field allowlist; owner/admin lifecycle
reads remain on `stores`.

Private data moves to `merchantApplications/{storeId}` with `storeId`,
`ownerId`, the six private fields above, application `status`, and timestamps.
Only the owner and an active admin can read it.

## Backfill and deploy order

1. Export and checksum all affected `stores` and `products` documents. Record
   document counts by store status. Keep the export encrypted and access
   controlled.
2. Dry-run the transform against an emulator export. Reject duplicate/missing
   owners, invalid statuses, oversized documents, and malformed document URLs.
3. Create `merchantApplications/{storeId}` for every store, copying the exact
   private fields and lifecycle status. Use create-only/preconditioned writes so
   a retry cannot overwrite a newer application. Do not remove store fields yet.
4. Verify every application by store ID, owner ID, status, field-by-field hash,
   document count, and a sample of applicant/admin reads. Confirm anonymous and
   unrelated-user reads are denied under the candidate rules.
5. Create the new product indexes, deploy the visibility and public-store
   synchronizers, backfill `publicStores` from approved stores using only the
   public allowlist, and
   backfill `products.publiclyVisible` to `product.status == "approved" &&
   parentStore.status == "approved"`. Verify counts per store and test checkout.
6. Deploy the compatible application/admin client that reads and writes the
   private collection. Its trusted moderation function transaction updates
   store status, application status, the public projection, and the owner's
   role/store link atomically.
7. Remove `email`, `phone`, `address`, `businessName`, `businessDocumentUrl`,
   and `rejectionReason` from each public store with preconditioned writes.
   Re-read and verify the public-schema allowlist before marking each item done.
8. Deploy the final Firestore rules immediately after the scrub. If strict
   privacy must take precedence over storefront availability, reverse steps 7
   and 8: the final rules deliberately deny legacy approved stores containing
   private fields until each is sanitized.
9. Run anonymous store/product queries, applicant isolation tests, admin review,
   merchant settings, suspension/resumption, and trusted checkout canaries.
   Retain the encrypted export only for the approved retention period.

## Inline business documents

The current `businessDocumentUrl` may be a large `data:` URL rather than an
external URL. It must be copied byte-for-byte into the private application
record and hash-verified before removal from `stores`. Its decoded file content
is sensitive, and exports/logs must never print it. A later move to private
object storage should decode it in memory, upload to an owner/admin-only path,
verify content hash and MIME type, replace the application field with the
private object reference, and then remove the inline value. Any previously
issued public download token must be revoked or the object moved.

## Rollback

- Stop on the first checksum/count mismatch; preconditioned writes make reruns
  safe.
- Roll back the new client/function version if needed, but do **not** restore
  private fields to public store documents.
- If final rules cause a storefront outage, fix or complete the `publicStores`
  projection backfill. Never restore the legacy public-read rule while
  sensitive fields remain.
- Private applications can be restored from the encrypted export to the same
  IDs. Product visibility can be recomputed deterministically from product and
  store status.

No production command is included intentionally. A separately reviewed,
environment-locked Admin SDK job is required for an eventual production run.
