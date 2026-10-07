import type {
  CommerceMutation,
  CommerceRecord,
  FirestoreRestCommerceRepository,
  FirestoreRestRepositoryOptions,
  FirestoreRestTransaction,
} from "./firestore-rest-contract.ts";
import {
  createEmulatorFirestoreRestClient,
  createHostedFirestoreRestClient,
  FIRESTORE_DATABASE_ID,
  type FirestoreFieldTransform,
  type FirestoreRestClient,
  FirestoreRestProviderError,
  type FirestoreWrite,
} from "./firestore-rest-client.ts";
import {
  encodeFirestoreFields,
  encodeFirestoreTimestamp,
  encodeFirestoreValue,
  type FirestoreValue,
} from "./firestore-rest-codec.ts";
import { LOCAL_PROJECT_ID } from "./runtime-guard.js";
import { validFirestoreDocumentId } from "../../functions/domain/identifiers.js";
import {
  MERCHANT_STORE_PROFILE_FIELDS,
  PUBLIC_STORE_FIELDS,
} from "../../functions/domain/stores.js";

const AUTO_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_MAX_ATTEMPTS = 10;
const STORE_MODERATION_STATUSES = Object.freeze([
  "approved",
  "rejected",
  "suspended",
]);
const SUPPORT_STATUSES = Object.freeze([
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

type IdKind = "order" | "couponUsage" | "supportTicket" | "immutable";
type CreateDocumentId = (kind: IdKind, index: number) => string;
type Sleep = (milliseconds: number) => Promise<void>;

interface RepositoryControls {
  readonly maxAttempts?: number;
  readonly createDocumentId?: CreateDocumentId;
  readonly sleep?: Sleep;
}

export interface HostedFirestoreRestRepositoryOptions
  extends FirestoreRestRepositoryOptions, RepositoryControls {}

export interface EmulatorFirestoreRestRepositoryOptions
  extends RepositoryControls {
  readonly projectId: typeof LOCAL_PROJECT_ID;
  readonly databaseId: typeof FIRESTORE_DATABASE_ID;
  readonly emulatorHost: string;
  readonly fetcher: typeof fetch;
}

interface IdLedger {
  readonly order: string[];
  readonly couponUsage: string[];
  readonly supportTicket: string[];
  readonly immutable: string[];
}

interface AttemptIdCursors {
  order: number;
  couponUsage: number;
  supportTicket: number;
  immutable: number;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (!plainObject(value)) {
    throw new TypeError("Trusted mutation must be a plain object.");
  }
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !keys.includes(key))
  ) {
    throw new TypeError("Trusted mutation contains unsupported fields.");
  }
}

function assertInventoryMutation(patch: CommerceMutation): void {
  assertExactKeys(patch, ["stock", "variants", "soldCount"], ["stock"]);
  if (!Number.isSafeInteger(patch.stock) || (patch.stock as number) < 0) {
    throw new TypeError("Trusted inventory stock is invalid.");
  }
  if (patch.variants !== undefined && !Array.isArray(patch.variants)) {
    throw new TypeError("Trusted inventory variants are invalid.");
  }
  if (
    patch.soldCount !== undefined &&
    (!Number.isSafeInteger(patch.soldCount) || (patch.soldCount as number) < 0)
  ) {
    throw new TypeError("Trusted inventory sold count is invalid.");
  }
}

function assertProductMutation(
  patch: CommerceMutation,
  serverTimestampFields: readonly string[],
): void {
  if (
    !Array.isArray(serverTimestampFields) ||
    new Set(serverTimestampFields).size !== serverTimestampFields.length
  ) {
    throw new TypeError("Trusted product server timestamps are invalid.");
  }
  const signature = plainObject(patch)
    ? Object.keys(patch).sort().join(",")
    : "";
  if (signature !== "publiclyVisible,rejectionReason,status") {
    if (serverTimestampFields.length) {
      throw new TypeError("Trusted product server timestamps are invalid.");
    }
    assertInventoryMutation(patch);
    return;
  }
  if (
    !["approved", "rejected", "archived"].includes(patch.status as string) ||
    typeof patch.rejectionReason !== "string" ||
    typeof patch.publiclyVisible !== "boolean" ||
    (patch.status !== "approved" && patch.publiclyVisible !== false) ||
    (patch.status === "approved"
      ? serverTimestampFields.length !== 1 ||
        serverTimestampFields[0] !== "publishedAt"
      : serverTimestampFields.length !== 0)
  ) {
    throw new TypeError("Trusted product moderation mutation is invalid.");
  }
}

function assertStoreStatus(
  status: unknown,
): asserts status is "approved" | "rejected" | "suspended" {
  if (!STORE_MODERATION_STATUSES.includes(status as string)) {
    throw new TypeError("Trusted store status is invalid.");
  }
}

function assertStoreProfileMutation(patch: CommerceMutation): void {
  assertExactKeys(patch, MERCHANT_STORE_PROFILE_FIELDS);
  if (
    !Object.keys(patch).length ||
    Object.values(patch).some((value) => value === undefined)
  ) {
    throw new TypeError("Trusted store profile mutation is invalid.");
  }
}

function assertPublicStoreProjection(
  projection: CommerceMutation,
): asserts projection is CommerceMutation & {
  ownerId: string;
  name: string;
  status: "approved";
} {
  assertExactKeys(
    projection,
    PUBLIC_STORE_FIELDS.filter((field: string) => field !== "updatedAt"),
    ["ownerId", "name", "status"],
  );
  if (
    !validFirestoreDocumentId(projection.ownerId) ||
    typeof projection.name !== "string" || !projection.name.trim() ||
    projection.status !== "approved" ||
    Object.values(projection).some((value) => value === undefined) ||
    (projection.createdAt !== undefined &&
      !Number.isSafeInteger(projection.createdAt))
  ) {
    throw new TypeError("Trusted public store projection is invalid.");
  }
}

function assertOrderMutation(
  patch: CommerceMutation,
  timelineEntries: readonly CommerceMutation[],
): void {
  assertExactKeys(
    patch,
    [
      "status",
      "cancelReason",
      "returnReason",
      "cashReceived",
      "cashReceivedAt",
    ],
    ["status"],
  );
  if (typeof patch.status !== "string" || !patch.status) {
    throw new TypeError("Trusted order status is invalid.");
  }
  const signature = Object.keys(patch).sort().join(",");
  if (
    ![
      "status",
      "cancelReason,status",
      "returnReason,status",
      "cashReceived,cashReceivedAt,status",
    ].includes(signature)
  ) {
    throw new TypeError("Trusted order mutation shape is invalid.");
  }
  if (
    patch.cancelReason !== undefined && typeof patch.cancelReason !== "string"
  ) {
    throw new TypeError("Trusted cancellation reason is invalid.");
  }
  if (
    patch.returnReason !== undefined && typeof patch.returnReason !== "string"
  ) {
    throw new TypeError("Trusted return reason is invalid.");
  }
  if (patch.cashReceived !== undefined && patch.cashReceived !== true) {
    throw new TypeError("Trusted cash confirmation is invalid.");
  }
  if (
    patch.cashReceivedAt !== undefined &&
    !Number.isSafeInteger(patch.cashReceivedAt)
  ) {
    throw new TypeError("Trusted cash confirmation time is invalid.");
  }
  if (
    !Array.isArray(timelineEntries) ||
    timelineEntries.some((entry) =>
      !plainObject(entry) || typeof entry.status !== "string" ||
      !Number.isSafeInteger(entry.at) || typeof entry.by !== "string"
    )
  ) {
    throw new TypeError("Trusted order timeline is invalid.");
  }
}

function assertSimpleFields(value: CommerceMutation): string[] {
  if (!plainObject(value)) {
    throw new TypeError("Trusted mutation must be a plain object.");
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key))) {
    throw new TypeError("Trusted mutation contains unsupported fields.");
  }
  return keys;
}

function defaultDocumentId(): string {
  let id = "";
  while (id.length < 20) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    for (const byte of bytes) {
      if (byte >= 248) continue;
      id += AUTO_ID_ALPHABET[byte % AUTO_ID_ALPHABET.length];
      if (id.length === 20) break;
    }
  }
  return id;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(attempt: number): number {
  const ceiling = Math.min(500, 20 * 2 ** (attempt - 1));
  const random = crypto.getRandomValues(new Uint16Array(1))[0] / 65_535;
  return Math.floor(ceiling / 2 + random * ceiling / 2);
}

function serverTimestamp(fieldPath: string): FirestoreFieldTransform {
  return { fieldPath, setToServerValue: "REQUEST_TIME" };
}

function createWrite(
  client: FirestoreRestClient,
  collection: string,
  id: string,
  data: CommerceMutation,
  fieldOverrides: Readonly<Record<string, FirestoreValue>> = {},
): FirestoreWrite {
  const fields = { ...encodeFirestoreFields(data), ...fieldOverrides };
  return {
    update: { name: client.documentName(collection, id), fields },
    currentDocument: { exists: false },
    updateTransforms: [
      serverTimestamp("createdAt"),
      serverTimestamp("updatedAt"),
    ],
  };
}

function updateWrite(
  client: FirestoreRestClient,
  collection: string,
  id: string,
  patch: CommerceMutation,
  transforms: readonly FirestoreFieldTransform[] = [],
): FirestoreWrite {
  const fieldPaths = assertSimpleFields(patch);
  return {
    update: {
      name: client.documentName(collection, id),
      fields: encodeFirestoreFields(patch),
    },
    updateMask: { fieldPaths },
    currentDocument: { exists: true },
    updateTransforms: [...transforms, serverTimestamp("updatedAt")],
  };
}

function setPublicStoreWrite(
  client: FirestoreRestClient,
  id: string,
  projection: CommerceMutation,
): FirestoreWrite {
  assertPublicStoreProjection(projection);
  const { createdAt, ...fields } = projection;
  return {
    update: {
      name: client.documentName("publicStores", id),
      fields: {
        ...encodeFirestoreFields(fields),
        ...(createdAt !== undefined
          ? { createdAt: encodeFirestoreTimestamp(createdAt as number) }
          : {}),
      },
    },
    updateTransforms: [serverTimestamp("updatedAt")],
  };
}

function createAttemptPort(
  client: FirestoreRestClient,
  transaction: string,
  ledger: IdLedger,
  createDocumentId: CreateDocumentId,
): {
  readonly port: FirestoreRestTransaction;
  readonly writes: FirestoreWrite[];
} {
  const writes: FirestoreWrite[] = [];
  const cursors: AttemptIdCursors = {
    order: 0,
    couponUsage: 0,
    supportTicket: 0,
    immutable: 0,
  };

  function nextId(kind: IdKind): string {
    const index = cursors[kind]++;
    const ids = ledger[kind];
    if (ids[index] !== undefined) return ids[index];
    const id = createDocumentId(kind, index);
    const collection = kind === "order"
      ? "orders"
      : kind === "supportTicket"
      ? "supportTickets"
      : "couponUsages";
    client.documentName(collection, id);
    ids.push(id);
    return id;
  }

  function stageCreate(
    collection: string,
    id: string,
    data: CommerceMutation,
    overrides?: Readonly<Record<string, FirestoreValue>>,
  ): void {
    assertSimpleFields(data);
    writes.push(createWrite(client, collection, id, data, overrides));
  }

  function stageImmutable(collection: string, data: CommerceMutation): void {
    stageCreate(collection, nextId("immutable"), data);
  }

  const port: FirestoreRestTransaction = {
    newOrderId(): string {
      return nextId("order");
    },
    newCouponUsageId(): string {
      return nextId("couponUsage");
    },
    newSupportTicketId(): string {
      return nextId("supportTicket");
    },
    getUser(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "users", id);
    },
    getStore(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "stores", id);
    },
    getMerchantApplication(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "merchantApplications", id);
    },
    getStores(ids): Promise<Map<string, CommerceRecord | null>> {
      return client.batchGet(transaction, "stores", ids);
    },
    getProduct(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "products", id);
    },
    getProducts(ids): Promise<Map<string, CommerceRecord | null>> {
      return client.batchGet(transaction, "products", ids);
    },
    getOrder(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "orders", id);
    },
    getCheckoutRequest(customerId, requestId): Promise<CommerceRecord | null> {
      return client.getDocument(
        transaction,
        "checkoutRequests",
        `${customerId}_${requestId}`,
      );
    },
    getCustomerOrderState(customerId): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "customerOrderStates", customerId);
    },
    async hasPriorCustomerOrder(customerId): Promise<boolean> {
      return (await client.runEqualQuery(
        transaction,
        "orders",
        "customerId",
        encodeFirestoreValue(customerId),
        1,
      )).length > 0;
    },
    findCouponsByCode(code): Promise<CommerceRecord[]> {
      return client.runEqualQuery(
        transaction,
        "coupons",
        "code",
        encodeFirestoreValue(code),
        5,
      );
    },
    getCustomerCouponUsage(
      couponId,
      customerId,
    ): Promise<CommerceRecord | null> {
      return client.getDocument(
        transaction,
        "customerCouponUsages",
        `${couponId}_${customerId}`,
      );
    },
    getNewsletterSubscription(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "newsletter", id);
    },
    getSupportTicket(id): Promise<CommerceRecord | null> {
      return client.getDocument(transaction, "supportTickets", id);
    },
    getAdminUsers(): Promise<CommerceRecord[]> {
      return client.runEqualQuery(
        transaction,
        "users",
        "role",
        encodeFirestoreValue("admin"),
      );
    },
    createOrder(id, data): void {
      stageCreate("orders", id, data);
    },
    updateOrder(id, patch, timelineEntries = []): void {
      assertOrderMutation(patch, timelineEntries);
      const transforms: FirestoreFieldTransform[] = timelineEntries.length
        ? [{
          fieldPath: "timeline",
          appendMissingElements: {
            values: timelineEntries.map((entry) => encodeFirestoreValue(entry)),
          },
        }]
        : [];
      writes.push(updateWrite(client, "orders", id, patch, transforms));
    },
    updateProduct(id, patch, serverTimestampFields = []): void {
      assertProductMutation(patch, serverTimestampFields);
      writes.push(
        updateWrite(
          client,
          "products",
          id,
          patch,
          serverTimestampFields.map(serverTimestamp),
        ),
      );
    },
    updateStoreStatus(id, status): void {
      assertStoreStatus(status);
      writes.push(updateWrite(client, "stores", id, { status }));
    },
    updateStoreProfile(id, patch): void {
      assertStoreProfileMutation(patch);
      writes.push(updateWrite(client, "stores", id, patch));
    },
    updateStoreVerified(id, verified): void {
      if (typeof verified !== "boolean") {
        throw new TypeError("Trusted store verification mutation is invalid.");
      }
      writes.push(updateWrite(client, "stores", id, { verified }));
    },
    updateMerchantApplicationStatus(id, status, rejectionReason): void {
      assertStoreStatus(status);
      if (
        typeof rejectionReason !== "string" || rejectionReason.length > 2000
      ) {
        throw new TypeError(
          "Trusted merchant application mutation is invalid.",
        );
      }
      writes.push(updateWrite(client, "merchantApplications", id, {
        status,
        rejectionReason,
      }));
    },
    setPublicStore(id, projection): void {
      writes.push(setPublicStoreWrite(client, id, projection));
    },
    deletePublicStore(id): void {
      writes.push({ delete: client.documentName("publicStores", id) });
    },
    promoteStoreOwnerToMerchant(ownerId, storeId): void {
      if (
        !validFirestoreDocumentId(ownerId) ||
        !validFirestoreDocumentId(storeId)
      ) {
        throw new TypeError("Trusted store owner promotion is invalid.");
      }
      writes.push(updateWrite(client, "users", ownerId, {
        role: "merchant",
        storeId,
      }));
    },
    updateUserRole(id, role): void {
      if (
        !validFirestoreDocumentId(id) || !["admin", "customer"].includes(role)
      ) {
        throw new TypeError("Trusted user role mutation is invalid.");
      }
      writes.push(updateWrite(client, "users", id, { role }));
    },
    updateUserSuspended(id, suspended): void {
      if (!validFirestoreDocumentId(id) || typeof suspended !== "boolean") {
        throw new TypeError("Trusted user suspension mutation is invalid.");
      }
      writes.push(updateWrite(client, "users", id, { suspended }));
    },
    updateCouponUsageCount(id, usedCount): void {
      if (!Number.isSafeInteger(usedCount) || usedCount < 0) {
        throw new TypeError("Trusted coupon usage count is invalid.");
      }
      writes.push(updateWrite(client, "coupons", id, { usedCount }));
    },
    createCouponUsage(id, data): void {
      stageCreate("couponUsages", id, data);
    },
    writeCustomerCouponUsage(couponId, customerId, data, exists): void {
      const id = `${couponId}_${customerId}`;
      if (exists) {
        writes.push(updateWrite(client, "customerCouponUsages", id, data));
      } else {
        stageCreate("customerCouponUsages", id, data);
      }
    },
    writeCustomerOrderState(customerId, data, exists): void {
      if (exists) {
        writes.push(
          updateWrite(client, "customerOrderStates", customerId, data),
        );
      } else {
        stageCreate("customerOrderStates", customerId, data);
      }
    },
    createCheckoutRequest(customerId, requestId, data): void {
      assertSimpleFields(data);
      const { expiresAtMillis, ...requestData } = data;
      stageCreate(
        "checkoutRequests",
        `${customerId}_${requestId}`,
        requestData,
        { expiresAt: encodeFirestoreTimestamp(expiresAtMillis as number) },
      );
    },
    createNewsletterSubscription(id, data): void {
      const keys = assertSimpleFields(data);
      if (
        keys.length !== 1 || keys[0] !== "email" ||
        typeof data.email !== "string" || data.email.length < 3 ||
        data.email.length > 320
      ) {
        throw new TypeError("Trusted newsletter subscription is invalid.");
      }
      stageCreate("newsletter", id, data);
    },
    createSupportTicket(id, data): void {
      stageCreate("supportTickets", id, data);
    },
    appendSupportTicketMessage(id, message, notificationRevision): void {
      assertSimpleFields(message);
      if (!Number.isSafeInteger(notificationRevision) || notificationRevision < 1) {
        throw new TypeError("Trusted support notification revision is invalid.");
      }
      writes.push(updateWrite(
        client,
        "supportTickets",
        id,
        { _trustedSupportNotificationRevision: notificationRevision },
        [{
          fieldPath: "messages",
          appendMissingElements: { values: [encodeFirestoreValue(message)] },
        }],
      ));
    },
    updateSupportTicketStatus(id, status, notificationRevision): void {
      if (!SUPPORT_STATUSES.includes(status)) {
        throw new TypeError("Trusted support ticket status is invalid.");
      }
      if (!Number.isSafeInteger(notificationRevision) || notificationRevision < 1) {
        throw new TypeError("Trusted support notification revision is invalid.");
      }
      writes.push(updateWrite(client, "supportTickets", id, {
        status,
        _trustedSupportNotificationRevision: notificationRevision,
      }));
    },
    createInventoryLog(data): void {
      stageImmutable("inventoryLogs", data);
    },
    createActivityLog(data): void {
      stageImmutable("activityLogs", data);
    },
    createNotification(data): void {
      stageImmutable("notifications", data);
    },
  };
  return { port, writes };
}

async function safeRollback(
  client: FirestoreRestClient,
  transaction: string,
): Promise<void> {
  try {
    await client.rollback(transaction);
  } catch {
    // The original failure remains authoritative and sanitized. A transaction
    // may already be closed by Firestore when commit fails.
  }
}

function repository(
  client: FirestoreRestClient,
  controls: RepositoryControls,
): FirestoreRestCommerceRepository {
  const maxAttempts = controls.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (
    !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 ||
    maxAttempts > MAX_MAX_ATTEMPTS
  ) {
    throw new TypeError("Firestore transaction retry limit is invalid.");
  }
  const createDocumentId = controls.createDocumentId ??
    (() => defaultDocumentId());
  const sleep = controls.sleep ?? defaultSleep;
  if (typeof createDocumentId !== "function" || typeof sleep !== "function") {
    throw new TypeError("Firestore transaction dependencies are invalid.");
  }

  return Object.freeze({
    transactionSemantics: "firestore-rest-serializable-retry" as const,
    async getAdminUserIds(): Promise<string[]> {
      return await client.queryAdminUserIds();
    },
    async getUserAdministrationPrerequisites(actorId: string, userId: string) {
      if (
        !validFirestoreDocumentId(actorId) || !validFirestoreDocumentId(userId)
      ) {
        throw new TypeError(
          "Trusted user administration preflight is invalid.",
        );
      }
      const [actor, target] = await Promise.all([
        client.getDocumentDirect("users", actorId),
        client.getDocumentDirect("users", userId),
      ]);
      let store = null;
      if (
        target?.role === "merchant" && typeof target.storeId === "string" &&
        validFirestoreDocumentId(target.storeId)
      ) {
        store = await client.getDocumentDirect("stores", target.storeId);
      }
      return { actor, target, store };
    },
    async getStoreModerationPrerequisites(actorId: string, storeId: string) {
      if (
        !validFirestoreDocumentId(actorId) ||
        !validFirestoreDocumentId(storeId)
      ) {
        throw new TypeError("Trusted store moderation preflight is invalid.");
      }
      const [user, store] = await Promise.all([
        client.getDocumentDirect("users", actorId),
        client.getDocumentDirect("stores", storeId),
      ]);
      return { user, store };
    },
    async reconcileStoreProductVisibility(
      storeId: string,
      storeApproved: boolean,
    ): Promise<void> {
      if (
        !validFirestoreDocumentId(storeId) ||
        typeof storeApproved !== "boolean"
      ) {
        throw new TypeError("Trusted store product reconciliation is invalid.");
      }
      const products = await client.queryStoreProducts(storeId);
      const writes = products.flatMap((product) => {
        const publiclyVisible = storeApproved && product.status === "approved";
        return product.publiclyVisible === publiclyVisible
          ? []
          : [updateWrite(client, "products", product.id, {
            publiclyVisible,
          })];
      });
      for (let offset = 0; offset < writes.length; offset += 500) {
        await client.commitWrites(writes.slice(offset, offset + 500));
      }
    },
    async runTransaction<T>(
      operation: (transaction: FirestoreRestTransaction) => Promise<T>,
    ): Promise<T> {
      if (typeof operation !== "function") {
        throw new TypeError("Firestore transaction callback is invalid.");
      }
      const ledger: IdLedger = {
        order: [],
        couponUsage: [],
        supportTicket: [],
        immutable: [],
      };
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let transaction: string | null = null;
        try {
          transaction = await client.beginTransaction();
          const staged = createAttemptPort(
            client,
            transaction,
            ledger,
            createDocumentId,
          );
          const result = await operation(Object.freeze(staged.port));
          await client.commit(transaction, staged.writes);
          return result;
        } catch (error) {
          if (transaction !== null) await safeRollback(client, transaction);
          const retry = error instanceof FirestoreRestProviderError &&
            error.code === "aborted" && attempt < maxAttempts;
          if (!retry) throw error;
          await sleep(retryDelay(attempt));
        }
      }
      throw new FirestoreRestProviderError("aborted");
    },
  });
}

export function createFirestoreRestCommerceRepository(
  options: HostedFirestoreRestRepositoryOptions,
): FirestoreRestCommerceRepository {
  return repository(createHostedFirestoreRestClient(options), options);
}

export function createEmulatorFirestoreRestCommerceRepository(
  options: EmulatorFirestoreRestRepositoryOptions,
): FirestoreRestCommerceRepository {
  return repository(createEmulatorFirestoreRestClient(options), options);
}
