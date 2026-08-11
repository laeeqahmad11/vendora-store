# Trusted checkout production rollout

This is an operator checklist, not an authorization to run against production. Every production command must use the explicit `production` alias. The repository default is the synthetic `demo-vendora-e2e` project so an unqualified Firebase command cannot deploy Vendora production.

## Approved runtime baseline

- Functions: second generation callable functions on Node.js 22, ESM.
- Region: `us-central1` unless the production Firestore database and primary buyers are in another agreed region. The web client and Functions configuration must match.
- Per callable: 60-second timeout, 256 MiB memory, 0 minimum instances, 20 maximum instances, concurrency 40.
- Callable retries: none at the platform level. Firestore transaction retries and client retries are made safe by the idempotency record.
- Idempotency retention: 30 days from the first successful commit. Firestore TTL field: `checkoutRequests.expiresAt`.
- App Check: initially observe-only (`CHECKOUT_ENFORCE_APP_CHECK=false`), then enforced in a separate rollout after valid-token metrics are healthy.

## Rollout checklist

1. **Freeze and verify.** Record the release commit, require a clean tree, run the complete local regression suite, and confirm `firebase use` resolves to `demo-vendora-e2e`. For every later production command, include `--project production` or `--project vendora-store-30319`; never rely on the default.

2. **Back up Firestore.** Create or verify a same-location Cloud Storage backup bucket with retention/access controls. Then export the default database to a unique immutable prefix:

   ```text
   gcloud firestore export gs://<approved-backup-bucket>/vendora/pre-checkout-<UTC_TIMESTAMP> --database='(default)' --project=vendora-store-30319 --async
   ```

   Wait for the operation to succeed, record its operation ID and object prefix, and test that the export is listed before any write migration or deployment.

3. **Backfill coupon counters.** Before checkout adoption, run a separately reviewed Admin SDK migration in dry-run mode. Derive each `coupons.usedCount` from authoritative `couponUsages`, and each `customerCouponUsages/{couponId}_{customerId}.count` from the same history. Review zero/negative counts, duplicate usage records, missing coupon references, and mismatches. Save the dry-run report, apply in batches with preconditions, rerun dry-run, and require zero differences. Do not infer usage from mutable order coupon text alone.

4. **Backfill review aggregates.** Run a separately reviewed dry-run migration that derives each product's `ratingCount`, `ratingSum`, and `rating` from the review states accepted by the current rules. Flag missing products and invalid ratings. Save the report, apply in bounded batches with preconditions, rerun, and require zero differences.

5. **Prepare Functions configuration.** Create an untracked `functions/.env.production` containing only:

   ```text
   VENDORA_FUNCTION_REGION=us-central1
   CHECKOUT_ENFORCE_APP_CHECK=false
   ```

   Confirm Node.js 22, the approved region, the runtime limits above, and no local credentials or service-account JSON. Future payment/provider credentials must use `defineSecret()` plus Google Secret Manager and be bound only to the functions that need them; never expose them as `VITE_*` values.

6. **Deploy Functions first.** From the reviewed release commit, preview the target and function list, then deploy only the two callables with the explicit production alias:

   ```text
   firebase deploy --only functions:placeOrders,functions:cancelOrder --project production
   ```

   Confirm both are second generation, Node.js 22, in the expected region, with App Check still observe-only. Run a controlled production smoke order using a dedicated account and unique idempotency key; verify one order, one inventory decrement, and one idempotency record.

7. **Deploy the client.** Register the production web app with Firebase App Check using reCAPTCHA Enterprise. Put the public site key in the production client environment as `VITE_FIREBASE_APPCHECK_SITE_KEY`, set `VITE_FIREBASE_FUNCTIONS_REGION` to the exact Functions region, build the reviewed release, and deploy the client through the normal hosting provider. Do not put a reCAPTCHA secret or debug token in a `VITE_*` variable.

8. **Verify callable adoption.** Use structured logs and Firestore metrics to confirm new orders are created through `placeOrders`, valid calls carry authentication, no browser writes to `orders` succeed, exact replays return the original result, and invalid App Check traffic is visible in metrics. Compare order creation volume with callable success volume and investigate any gap before continuing.

9. **Deploy Firestore rules.** Only after callable adoption is healthy, deploy the reviewed rules explicitly:

   ```text
   firebase deploy --only firestore:rules --project production
   ```

   Immediately verify customer order creation and idempotency-record writes are denied from the Web SDK while normal reads and backend checkout still work.

10. **Enable checkout request TTL.** First query a sample of new `checkoutRequests` and verify `expiresAt` is a Firestore timestamp approximately 30 days after `createdAt`. Then create the TTL policy:

    ```text
    gcloud firestore fields ttls update expiresAt --collection-group=checkoutRequests --enable-ttl --project=vendora-store-30319 --async
    ```

    Monitor with `gcloud firestore operations list --project=vendora-store-30319` and `gcloud firestore fields ttls list --collection-group=checkoutRequests --project=vendora-store-30319`. TTL deletion is asynchronous and normally occurs within about 24 hours after expiry. Do not shorten retention without a duplicate-order risk review.

11. **Enforce App Check separately.** Observe Cloud Functions App Check metrics until supported browsers and legitimate traffic consistently send valid tokens. Keep emulator E2E unchanged. Then change only `CHECKOUT_ENFORCE_APP_CHECK=true` in the untracked production Functions environment and redeploy `placeOrders` and `cancelOrder` explicitly. Verify valid web calls succeed and a controlled missing-token call is rejected. App Check reduces calls from counterfeit clients and automated abuse; it does not replace Firebase Authentication, role/suspension checks, validation, idempotency, Security Rules, quotas, or per-account abuse monitoring. Token-consumption replay protection remains a separate beta decision because it adds latency and requires limited-use client tokens and an IAM role.

12. **Create monitoring and alerts.** Build log-based metrics from `checkout_completed`, `checkout_failed`, `order_cancellation_completed`, and `order_cancellation_failed`. Alert on sustained checkout failure ratio, `internal`/`aborted` spikes, p95/p99 latency near the 60-second timeout, instance/429 saturation, Function execution failures, coupon rejection spikes, stock-conflict spikes, and unexpected divergence between successful callable results and created orders. Dashboards and alerts must never extract addresses, email, phone, notes, tokens, or secrets.

13. **Rollback.** Keep the previous Functions and client artifacts and the Firestore export operation ID. If checkout fails, first roll the client back or disable its checkout entry point, then redeploy the last known-good callable revision with the explicit production alias. Do not restore the entire Firestore export over live writes. Reconcile ambiguous orders by idempotency key hash and order IDs before adjusting inventory or coupon counts. Firestore rules may be rolled back only to the immediately previous reviewed ruleset; never re-enable direct browser order creation. App Check can be returned to observe-only by setting `CHECKOUT_ENFORCE_APP_CHECK=false` and redeploying the callables. TTL can be disabled without restoring already deleted records:

    ```text
    gcloud firestore fields ttls update expiresAt --collection-group=checkoutRequests --disable-ttl --project=vendora-store-30319 --async
    ```

## Release blockers

- The coupon-counter and review-aggregate production backfill utilities do not yet exist in this repository. They require separate implementation, dry-run evidence, review, and staging rehearsal.
- Production App Check registration, valid-token metrics, and enforcement have not been performed.
- Production backup destination, monitoring policies, alert thresholds, and named rollback owner must be approved.
- The remaining Firebase Admin dependency advisories have no non-breaking upstream resolution in the current dependency graph. Reassess before release and test the next compatible Admin SDK release when available.
