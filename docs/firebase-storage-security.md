# Firebase Storage security and upload architecture

## Decision

Vendora does not currently use Firebase Storage for an application upload,
read, overwrite, or delete flow. `src/lib/firebase.ts` initializes the client so
the emulator suite can expose Storage, but `src/services/storage.service.ts`
converts files to inline `data:` URLs and no source file imports a Storage
object operation.

Storage is therefore fail-closed: every bucket read and write is denied,
including owner-looking paths and admin clients. Firebase Admin SDK operations
would still bypass rules, as usual, but Vendora has no Admin SDK Storage flow.
The rule must stay closed until an explicit migration ships with owned paths,
authorization, validation, lifecycle cleanup, and emulator coverage.

## Current upload surfaces

`ImageUploader` accepts `image/*`, uploads at most the surface-specific count,
and asks `storageService.uploadImage` to return a JPEG-compressed data URL. The
intended output budget is about 80,000 decoded bytes per image. GIF and other
non-compressed fallbacks are rejected above that budget. The compression loop
can return its smallest JPEG even when it did not reach the budget, so the
80,000-byte maximum is not an absolute invariant for compressible inputs.

| Surface | Accepted input / count | Current persistence | Read access | Overwrite/delete access | Sensitivity |
| --- | --- | --- | --- | --- | --- |
| Product images | `image/*`; up to 8; intended ~80 KB each | `products.images[]` | Public only when product is approved and publicly visible; owning active merchant and admin otherwise | Owning active merchant or admin may update/delete the product under the product lifecycle rules | Public catalog asset after approval |
| Product video | No uploader exists; `videoUrl` is only a dormant model/moderation field | No current UI persistence | N/A | N/A | N/A |
| Customer profile photo | `image/*`; 1; intended ~80 KB | `users/{uid}.photoURL` | User and admin | Active user may update normal fields; admin may update/delete profile | Private profile data in the current rules |
| Review images | `image/*`; up to 4; intended ~80 KB each | `reviews.images[]` | Public for approved reviews; author, owning active merchant, and admin otherwise | Customer can create; no author edit flow; merchant/admin updates are field-limited; admin-only delete | Public after approval; otherwise restricted |
| Merchant application logo | `image/*`; 1; intended ~80 KB | `stores/{storeId}.logoUrl`, later projected to `publicStores` only for approved stores | Owner/admin while non-public; public for approved safe-schema stores | Applicant can create/resubmit; approved active owner can update branding; admin deletion | Deliberately public branding after approval |
| Merchant logo and banner | `image/*`; 1 each; intended ~80 KB each | `stores/{storeId}.logoUrl` and `.bannerUrl`, then approved `publicStores` projection | Public for approved safe-schema stores; owner/admin otherwise | Approved active owner can update; admin deletes store | Public branding |
| Merchant collection cover | `image/*`; 1; intended ~80 KB | `collections/{id}.imageUrl` | Public | Owning active merchant for a store collection; admin for all | Public catalog asset |
| Merchant promotion banner | `image/*`; 1; intended ~80 KB | `promotions/{id}.imageUrl` | Public | Owning active merchant for store promotion; admin for all | Public marketing asset |
| Business/legal application document | Picker accepts `.pdf,image/*`; one file; intended max 700 KB decoded | `merchantApplications/{storeId}.businessDocumentUrl` | Application owner and admin only | Owner can update allowed application fields in permitted states; admin can change moderation reason/delete | **Sensitive/private** |
| Category image | `image/*`; 1; intended ~80 KB | `categories/{id}.imageUrl` | Public | Admin only | Public catalog asset |
| Brand logo | `image/*`; 1; intended ~80 KB | `brands/{id}.logoUrl` | Public | Admin only | Public catalog asset |
| Global collection cover | `image/*`; 1; intended ~80 KB | `collections/{id}.imageUrl` | Public | Admin only | Public catalog asset |
| Blog cover | `image/*`; 1; intended ~80 KB | `blogs/{id}.coverUrl` | Public | Admin only | Public CMS asset |
| Homepage banner | `image/*`; 1; intended ~80 KB | `banners/{id}.imageUrl` | Public | Admin only | Public CMS asset |
| Global promotion image | `image/*`; 1; intended ~80 KB | `promotions/{id}.imageUrl` | Public | Admin only | Public marketing asset |
| Platform logo | `image/*`; 1; intended ~80 KB | `settings/platform.logoUrl` | Public | Admin only | Public branding |
| Support attachment | No attachment model, file input, or upload helper call exists | N/A | N/A | N/A | N/A |
| Product CSV import | `.csv,text/csv`; parsed locally, not uploaded or persisted as a file | Resulting draft product fields in Firestore | Same as product documents | Same as product documents | Source file remains local |

The `folder` strings passed to `ImageUploader` are compatibility arguments and
do not name real bucket paths today.

## Private merchant documents

Business/legal data, including `businessDocumentUrl`, is stored only in
`merchantApplications`. It is not written to `stores`. The trusted
`publicStores` projection allowlists public store fields and does not include
application fields. Firestore rules allow application reads only to the owner
or an active admin. Storage rules also deny every read, including paths under
`applications/`.

## Inline data URL risk classification

### Launch blockers

No remaining Storage access blocker exists while the deny-all rule is deployed
with any newly enabled bucket. Production deployment is intentionally outside
this audit. A launch process that enables a bucket without deploying the
fail-closed rules would remain unsafe.

### P1 migration

- Firestore documents have a 1 MiB maximum, including field names and all other
  data. Base64 adds roughly one third to binary size. Eight intended 80 KB
  product images consume roughly 850 KB as strings before other document data.
- The compression fallback does not prove its final JPEG met the intended byte
  budget. Large or hard-to-compress inputs can fail only when Firestore rejects
  the resulting document.
- Business documents have client-side size handling but no authoritative MIME
  inspection; the file picker and `File.type` are not security boundaries.
- Sensitive document bytes are copied into every authorized Firestore document
  read and cannot use object-level access logs, short-lived URLs, retention, or
  independent lifecycle controls.
- Deleting or replacing an inline field removes the only stored bytes, but
  offline caches, backups, exports, and prior document versions need their own
  retention treatment.

### P2 optimization

- Inline payloads amplify Firestore reads, cache size, memory, parsing, and
  query downloads even when a screen needs only text metadata.
- There is no CDN/image transformation layer, responsive variants, streaming,
  byte ranges, or independent browser cache key.
- Inline data creates no separate orphan object, but repeated denormalized
  copies (for example order/cart image snapshots) can outlive the source asset
  and require document-specific cleanup.

## Future migration architecture

Implement migration surface by surface, retaining inline reads during a
transition. Use opaque server-generated object IDs rather than user filenames,
store only canonical object paths and derived delivery URLs in Firestore, and
make ownership derivable from trusted Firestore records rather than mutable
custom metadata.

- `users/{uid}/profile/{assetId}`: owner and admin write/delete; public read only
  if profile photos are deliberately made public.
- `stores/{storeId}/branding/{assetId}` and
  `stores/{storeId}/products/{productId}/{assetId}`: active owner of the
  approved store or admin writes; public read only for published assets.
- `reviews/{reviewId}/{assetId}`: review author may create before publication;
  immutable ownership; admin-controlled delete/moderation; read follows review
  visibility.
- `merchant-applications/{applicationId}/{assetId}`: owner and active admin only,
  with no anonymous read or permanent public URL.
- `cms/{kind}/{assetId}`: active admin writes; explicit public-read subpaths only
  for published assets.

Every enabled path needs exact byte limits, MIME allowlists plus content
inspection in trusted processing, practical extension checks, create/update/
delete distinctions, immutable ownership, suspension behavior, cross-tenant
tests, cleanup on failed form submission/replacement/deletion, and a staged
backfill with rollback metrics.
