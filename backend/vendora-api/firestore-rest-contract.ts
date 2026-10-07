import {
  FIRESTORE_DATABASE_ID,
  hostedFirestoreRestRoot,
} from "./firestore-rest-client.ts";

export type CommerceRecord = Readonly<Record<string, unknown>> & {
  readonly id: string;
};
export type CommerceMutation = Readonly<Record<string, unknown>>;

export interface FirestoreRestTransaction {
  newOrderId(): string;
  newCouponUsageId(): string;
  newSupportTicketId(): string;
  getUser(id: string): Promise<CommerceRecord | null>;
  getStore(id: string): Promise<CommerceRecord | null>;
  getMerchantApplication(id: string): Promise<CommerceRecord | null>;
  getStores(
    ids: readonly string[],
  ): Promise<Map<string, CommerceRecord | null>>;
  getProduct(id: string): Promise<CommerceRecord | null>;
  getProducts(
    ids: readonly string[],
  ): Promise<Map<string, CommerceRecord | null>>;
  getOrder(id: string): Promise<CommerceRecord | null>;
  getCheckoutRequest(
    customerId: string,
    requestId: string,
  ): Promise<CommerceRecord | null>;
  getCustomerOrderState(customerId: string): Promise<CommerceRecord | null>;
  hasPriorCustomerOrder(customerId: string): Promise<boolean>;
  findCouponsByCode(code: string): Promise<CommerceRecord[]>;
  getCustomerCouponUsage(
    couponId: string,
    customerId: string,
  ): Promise<CommerceRecord | null>;
  getNewsletterSubscription(id: string): Promise<CommerceRecord | null>;
  getSupportTicket(id: string): Promise<CommerceRecord | null>;
  getAdminUsers(): Promise<CommerceRecord[]>;
  createOrder(id: string, data: CommerceMutation): void;
  updateOrder(
    id: string,
    patch: CommerceMutation,
    timelineEntries?: readonly CommerceMutation[],
  ): void;
  updateProduct(
    id: string,
    patch: CommerceMutation,
    serverTimestampFields?: readonly string[],
  ): void;
  updateStoreStatus(
    id: string,
    status: "approved" | "rejected" | "suspended",
  ): void;
  updateStoreProfile(id: string, patch: CommerceMutation): void;
  updateStoreVerified(id: string, verified: boolean): void;
  updateMerchantApplicationStatus(
    id: string,
    status: "approved" | "rejected" | "suspended",
    rejectionReason: string,
  ): void;
  setPublicStore(id: string, projection: CommerceMutation): void;
  deletePublicStore(id: string): void;
  promoteStoreOwnerToMerchant(ownerId: string, storeId: string): void;
  updateUserRole(id: string, role: "admin" | "customer"): void;
  updateUserSuspended(id: string, suspended: boolean): void;
  updateCouponUsageCount(id: string, usedCount: number): void;
  createCouponUsage(id: string, data: CommerceMutation): void;
  writeCustomerCouponUsage(
    couponId: string,
    customerId: string,
    data: CommerceMutation,
    exists: boolean,
  ): void;
  writeCustomerOrderState(
    customerId: string,
    data: CommerceMutation,
    exists: boolean,
  ): void;
  createCheckoutRequest(
    customerId: string,
    requestId: string,
    data: CommerceMutation,
  ): void;
  createNewsletterSubscription(id: string, data: CommerceMutation): void;
  createSupportTicket(id: string, data: CommerceMutation): void;
  appendSupportTicketMessage(
    id: string,
    message: CommerceMutation,
    notificationRevision: number,
  ): void;
  updateSupportTicketStatus(
    id: string,
    status: "open" | "in_progress" | "resolved" | "closed",
    notificationRevision: number,
  ): void;
  createInventoryLog(data: CommerceMutation): void;
  createActivityLog(data: CommerceMutation): void;
  createNotification(data: CommerceMutation): void;
}

export interface FirestoreRestCommerceRepository {
  readonly transactionSemantics: "firestore-rest-serializable-retry";
  getStoreModerationPrerequisites(
    actorId: string,
    storeId: string,
  ): Promise<{ user: CommerceRecord | null; store: CommerceRecord | null }>;
  reconcileStoreProductVisibility(
    storeId: string,
    storeApproved: boolean,
  ): Promise<void>;
  getAdminUserIds(): Promise<string[]>;
  getUserAdministrationPrerequisites(
    actorId: string,
    userId: string,
  ): Promise<{
    actor: CommerceRecord | null;
    target: CommerceRecord | null;
    store: CommerceRecord | null;
  }>;
  runTransaction<T>(
    operation: (transaction: FirestoreRestTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface FirestoreRestRepositoryOptions {
  readonly projectId: string;
  readonly databaseId: typeof FIRESTORE_DATABASE_ID;
  readonly fetcher: typeof fetch;
  readonly getAccessToken: () => Promise<string>;
}

export type FirestoreRestRepositoryFactory = (
  options: FirestoreRestRepositoryOptions,
) => FirestoreRestCommerceRepository;

export const FIRESTORE_REST_TRANSACTION_REQUIREMENTS = Object.freeze({
  endpoint: hostedFirestoreRestRoot,
  atomicity:
    "Use beginTransaction plus one commit containing every staged write.",
  retries:
    "Retry the whole callback on ABORTED with bounded backoff and fresh authoritative reads.",
  reads:
    "All authorization, price, store, product, stock, coupon, order, and idempotency decisions are transactional.",
  creates:
    "Create-only mutations use exists=false preconditions and never overwrite collisions.",
  identifiers:
    "Generate document IDs before the callback and reuse them across callback retries.",
  timestamps:
    "Decode Firestore timestamps to epoch milliseconds and use server transforms for commit timestamps.",
  contention:
    "Coupon, first-order, inventory, idempotency, and cancellation records participate in conflict detection.",
  sideEffects:
    "The callback stages writes only; notifications and logs commit atomically with commerce state.",
});

export function assertFirestoreRestRepository(
  repository: FirestoreRestCommerceRepository,
): FirestoreRestCommerceRepository {
  if (
    !repository ||
    repository.transactionSemantics !== "firestore-rest-serializable-retry" ||
    typeof repository.runTransaction !== "function"
  ) {
    throw new TypeError("Firestore REST repository adapter is unavailable.");
  }
  return repository;
}
