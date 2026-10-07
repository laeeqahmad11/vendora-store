import {
  assertLoopbackEmulatorEndpoint,
  LOCAL_PROJECT_ID,
} from "./runtime-guard.js";
import {
  decodeFirestoreFields,
  decodeFirestoreTimestamp,
  type FirestoreDocument,
  type FirestoreValue,
} from "./firestore-rest-codec.ts";
import { isValidHostedProjectId } from "./hosted-runtime.ts";
import {
  assertNetworkTimeoutMs,
  boundedTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from "./network-timeout.ts";

export const FIRESTORE_DATABASE_ID = "(default)";

export function hostedFirestoreResourceRoot(
  projectId: string,
  databaseId: typeof FIRESTORE_DATABASE_ID,
): string {
  if (
    !isValidHostedProjectId(projectId) || databaseId !== FIRESTORE_DATABASE_ID
  ) {
    throw new Error("Hosted Firestore REST configuration is invalid.");
  }
  return `projects/${projectId}/databases/${databaseId}/documents`;
}

export function hostedFirestoreRestRoot(
  projectId: string,
  databaseId: typeof FIRESTORE_DATABASE_ID,
): string {
  return `https://firestore.googleapis.com/v1/${
    hostedFirestoreResourceRoot(projectId, databaseId)
  }`;
}

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TRANSACTION_TOKEN = /^[A-Za-z0-9+/_=-]{1,4096}$/u;
const ACCESS_TOKEN = /^[\x21-\x7e]{1,16384}$/u;
const COLLECTION = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
const FIRESTORE_EMULATOR_OWNER_SENTINEL = "Bearer owner";

type JsonRecord = Record<string, unknown>;

export interface FirestoreWrite {
  readonly update?: {
    readonly name: string;
    readonly fields: Readonly<Record<string, FirestoreValue>>;
  };
  readonly updateMask?: { readonly fieldPaths: readonly string[] };
  readonly updateTransforms?: readonly FirestoreFieldTransform[];
  readonly delete?: string;
  readonly verify?: string;
  readonly currentDocument?:
    | { readonly exists: boolean }
    | { readonly updateTime: string };
}

export type FirestoreFieldTransform =
  | {
    readonly fieldPath: string;
    readonly setToServerValue: "REQUEST_TIME";
  }
  | {
    readonly fieldPath: string;
    readonly appendMissingElements: {
      readonly values: readonly FirestoreValue[];
    };
  };

export interface FirestoreRecord extends Readonly<Record<string, unknown>> {
  readonly id: string;
}

interface BaseClientOptions {
  readonly fetcher: typeof fetch;
  readonly fetchTimeoutMs?: number;
}

export interface HostedClientOptions extends BaseClientOptions {
  readonly projectId: string;
  readonly databaseId: typeof FIRESTORE_DATABASE_ID;
  readonly getAccessToken: () => Promise<string>;
}

export interface EmulatorClientOptions extends BaseClientOptions {
  readonly projectId: typeof LOCAL_PROJECT_ID;
  readonly databaseId: typeof FIRESTORE_DATABASE_ID;
  readonly emulatorHost: string;
}

export class FirestoreRestProviderError extends Error {
  readonly code:
    | "aborted"
    | "already-exists"
    | "failed-precondition"
    | "not-found"
    | "resource-exhausted"
    | "internal";

  constructor(code: FirestoreRestProviderError["code"]) {
    super("Firestore REST repository request failed.");
    this.name = "FirestoreRestProviderError";
    this.code = code;
  }
}

function providerFailure(
  code: FirestoreRestProviderError["code"] = "internal",
): never {
  throw new FirestoreRestProviderError(code);
}

function plainObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function responseCode(
  status: number,
  payload: unknown,
): FirestoreRestProviderError["code"] {
  const providerStatus = plainObject(payload) && plainObject(payload.error)
    ? payload.error.status
    : undefined;
  if (providerStatus === "ABORTED") return "aborted";
  if (providerStatus === "ALREADY_EXISTS") return "already-exists";
  if (providerStatus === "FAILED_PRECONDITION") return "failed-precondition";
  if (providerStatus === "NOT_FOUND") return "not-found";
  if (providerStatus === "RESOURCE_EXHAUSTED") return "resource-exhausted";
  if (status === 404) return "not-found";
  if (status === 409) return "already-exists";
  if (status === 412) return "failed-precondition";
  if (status === 429) return "resource-exhausted";
  return "internal";
}

async function responseText(response: Response): Promise<string> {
  const length = response.headers.get("content-length");
  if (length !== null) {
    const parsed = Number(length);
    if (
      !Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_RESPONSE_BYTES
    ) {
      providerFailure();
    }
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    providerFailure();
  }
  if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) {
    providerFailure();
  }
  return text;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    providerFailure();
  }
}

async function errorPayload(response: Response): Promise<unknown> {
  try {
    const text = await responseText(response);
    return text ? parseJson(text) : null;
  } catch {
    return null;
  }
}

async function checkedJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    providerFailure(
      responseCode(response.status, await errorPayload(response)),
    );
  }
  const text = await responseText(response);
  if (!text) providerFailure();
  return parseJson(text);
}

async function streamedJson(response: Response): Promise<unknown[]> {
  if (!response.ok) {
    providerFailure(
      responseCode(response.status, await errorPayload(response)),
    );
  }
  const text = await responseText(response);
  if (!text.trim()) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [value];
  } catch {
    const values: unknown[] = [];
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      values.push(parseJson(line));
    }
    return values;
  }
}

function transactionToken(value: unknown): string {
  if (typeof value !== "string" || !TRANSACTION_TOKEN.test(value)) {
    providerFailure();
  }
  return value;
}

function safeDocumentId(value: string): boolean {
  if (
    !value || value.trim() !== value || value === "." || value === ".." ||
    /^__.*__$/u.test(value) || value.includes("/") ||
    new TextEncoder().encode(value).length > 1500
  ) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function assertCollection(value: string): void {
  if (!COLLECTION.test(value)) {
    throw new TypeError("Firestore collection name is invalid.");
  }
}

function assertDocumentId(value: string): void {
  if (!safeDocumentId(value)) {
    throw new TypeError("Firestore document ID is invalid.");
  }
}

function documentFromPayload(
  value: unknown,
  expectedName?: string,
): FirestoreDocument {
  if (!plainObject(value) || typeof value.name !== "string") providerFailure();
  if (expectedName !== undefined && value.name !== expectedName) {
    providerFailure();
  }
  if (value.fields !== undefined && !plainObject(value.fields)) {
    providerFailure();
  }
  return value as unknown as FirestoreDocument;
}

function recordFromDocument(document: FirestoreDocument): FirestoreRecord {
  const separator = document.name.lastIndexOf("/");
  if (separator < 0) providerFailure();
  const id = document.name.slice(separator + 1);
  assertDocumentId(id);
  return Object.freeze({ ...decodeFirestoreFields(document.fields), id });
}

export interface FirestoreRestClient {
  readonly projectId: string;
  readonly mode: "hosted" | "emulator";
  readonly documentsRoot: string;
  beginTransaction(): Promise<string>;
  getDocument(
    transaction: string,
    collection: string,
    id: string,
  ): Promise<FirestoreRecord | null>;
  getDocumentDirect(
    collection: string,
    id: string,
  ): Promise<FirestoreRecord | null>;
  batchGet(
    transaction: string,
    collection: string,
    ids: readonly string[],
  ): Promise<Map<string, FirestoreRecord | null>>;
  runEqualQuery(
    transaction: string,
    collection: string,
    fieldPath: string,
    value: FirestoreValue,
    limit?: number,
  ): Promise<FirestoreRecord[]>;
  queryStoreProducts(storeId: string): Promise<FirestoreRecord[]>;
  queryAdminUserIds(): Promise<string[]>;
  commit(transaction: string, writes: readonly FirestoreWrite[]): Promise<void>;
  commitWrites(writes: readonly FirestoreWrite[]): Promise<void>;
  rollback(transaction: string): Promise<void>;
  documentName(collection: string, id: string): string;
}

interface ClientConfiguration {
  readonly projectId: string;
  readonly mode: "hosted" | "emulator";
  readonly documentsRoot: string;
  readonly fetcher: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  readonly fetchTimeoutMs?: number;
}

type ReadPrecondition =
  | { readonly exists: false }
  | { readonly updateTime: string };

function createClient(configuration: ClientConfiguration): FirestoreRestClient {
  const {
    projectId,
    mode,
    documentsRoot,
    fetcher,
    getAccessToken,
    fetchTimeoutMs = PROVIDER_REQUEST_TIMEOUT_MS,
  } = configuration;
  const resourceRoot = `projects/${projectId}/databases/(default)/documents`;
  const emulatorTransactions = new Map<string, Map<string, ReadPrecondition>>();
  if (typeof fetcher !== "function") {
    throw new TypeError("Firestore REST fetch dependency is unavailable.");
  }
  assertNetworkTimeoutMs(fetchTimeoutMs);

  const documentName = (collection: string, id: string): string => {
    assertCollection(collection);
    assertDocumentId(id);
    return `${resourceRoot}/${collection}/${id}`;
  };
  const documentUrl = (collection: string, id: string): string => {
    documentName(collection, id);
    return `${documentsRoot}/${collection}/${encodeURIComponent(id)}`;
  };

  async function request(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (mode === "hosted") {
      let token: string;
      try {
        token = await getAccessToken!();
      } catch {
        providerFailure();
      }
      if (!ACCESS_TOKEN.test(token)) providerFailure();
      headers.set("authorization", `Bearer ${token}`);
    } else {
      // This non-secret sentinel is recognized only by the local Firestore
      // Emulator and matches the firebase-admin emulator transport. The mode
      // guard fixes both project and destination before it can be attached.
      headers.set("authorization", FIRESTORE_EMULATOR_OWNER_SENTINEL);
    }
    try {
      return await fetcher(url, {
        ...init,
        headers,
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: boundedTimeoutSignal(fetchTimeoutMs),
      });
    } catch {
      providerFailure();
    }
  }

  async function post(path: string, body: unknown): Promise<Response> {
    let serialized: string;
    try {
      serialized = JSON.stringify(body);
    } catch {
      providerFailure();
    }
    return await request(`${documentsRoot}${path}`, {
      method: "POST",
      body: serialized,
    });
  }

  function emulatorReadSet(transaction: string): Map<string, ReadPrecondition> {
    transactionToken(transaction);
    const readSet = emulatorTransactions.get(transaction);
    if (!readSet) providerFailure();
    return readSet;
  }

  function rememberEmulatorRead(
    transaction: string,
    name: string,
    precondition: ReadPrecondition,
  ): void {
    const readSet = emulatorReadSet(transaction);
    const existing = readSet.get(name);
    if (existing && JSON.stringify(existing) !== JSON.stringify(precondition)) {
      providerFailure("aborted");
    }
    readSet.set(name, precondition);
  }

  function updateTime(document: FirestoreDocument): string {
    if (typeof document.updateTime !== "string") providerFailure();
    decodeFirestoreTimestamp(document.updateTime);
    return document.updateTime;
  }

  const client: FirestoreRestClient = {
    projectId,
    mode,
    documentsRoot,
    documentName,
    async beginTransaction(): Promise<string> {
      if (mode === "emulator") {
        const transaction = `emulator-${crypto.randomUUID()}`;
        emulatorTransactions.set(transaction, new Map());
        return transaction;
      }
      const payload = await checkedJson(
        await post(":beginTransaction", { options: { readWrite: {} } }),
      );
      if (!plainObject(payload)) providerFailure();
      return transactionToken(payload.transaction);
    },
    async getDocument(transaction, collection, id) {
      transactionToken(transaction);
      const expectedName = documentName(collection, id);
      const query = mode === "hosted"
        ? `?transaction=${encodeURIComponent(transaction)}`
        : "";
      const response = await request(
        `${documentUrl(collection, id)}${query}`,
        { method: "GET" },
      );
      if (response.status === 404) {
        if (mode === "emulator") {
          rememberEmulatorRead(transaction, expectedName, { exists: false });
        }
        return null;
      }
      const payload = await checkedJson(response);
      const document = documentFromPayload(payload, expectedName);
      if (mode === "emulator") {
        rememberEmulatorRead(transaction, expectedName, {
          updateTime: updateTime(document),
        });
      }
      return recordFromDocument(document);
    },
    async getDocumentDirect(collection, id) {
      const expectedName = documentName(collection, id);
      const response = await request(documentUrl(collection, id), {
        method: "GET",
      });
      if (response.status === 404) return null;
      return recordFromDocument(
        documentFromPayload(await checkedJson(response), expectedName),
      );
    },
    async batchGet(transaction, collection, ids) {
      transactionToken(transaction);
      assertCollection(collection);
      if (new Set(ids).size !== ids.length) {
        throw new TypeError("Duplicate trusted multi-read ID.");
      }
      if (!ids.length) return new Map();
      if (mode === "emulator") {
        const entries = await Promise.all(ids.map(async (id) =>
          [
            id,
            await client.getDocument(transaction, collection, id),
          ] as const
        ));
        return new Map(entries);
      }
      const names = ids.map((id) => documentName(collection, id));
      const expected = new Set(names);
      const entries = await streamedJson(
        await post(":batchGet", {
          documents: names,
          transaction,
        }),
      );
      const byName = new Map<string, FirestoreRecord | null>();
      for (const entry of entries) {
        if (!plainObject(entry)) providerFailure();
        let name: string;
        let record: FirestoreRecord | null;
        if (entry.found !== undefined && entry.missing === undefined) {
          const document = documentFromPayload(entry.found);
          name = document.name;
          record = recordFromDocument(document);
        } else if (
          typeof entry.missing === "string" && entry.found === undefined
        ) {
          name = entry.missing;
          record = null;
        } else {
          providerFailure();
        }
        if (!expected.has(name) || byName.has(name)) providerFailure();
        byName.set(name, record);
      }
      if (byName.size !== names.length) providerFailure();
      return new Map(ids.map((id, index) => {
        const value = byName.get(names[index]);
        if (value === undefined) providerFailure();
        if (value !== null && value.id !== id) providerFailure();
        return [id, value];
      }));
    },
    async runEqualQuery(transaction, collection, fieldPath, value, limit) {
      transactionToken(transaction);
      assertCollection(collection);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(fieldPath)) {
        throw new TypeError("Firestore query field is invalid.");
      }
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) {
        throw new TypeError("Firestore query limit is invalid.");
      }
      const prefix = `${resourceRoot}/${collection}/`;
      const queryBody: Record<string, unknown> = {
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value,
            },
          },
          ...(limit === undefined ? {} : { limit }),
        },
        ...(mode === "hosted" ? { transaction } : {}),
      };
      const entries = await streamedJson(await post(":runQuery", queryBody));
      const records: FirestoreRecord[] = [];
      const names = new Set<string>();
      for (const entry of entries) {
        if (!plainObject(entry)) providerFailure();
        if (entry.document === undefined) {
          if (entry.readTime === undefined && entry.done !== true) {
            providerFailure();
          }
          continue;
        }
        const document = documentFromPayload(entry.document);
        if (!document.name.startsWith(prefix)) providerFailure();
        const suffix = document.name.slice(prefix.length);
        if (!safeDocumentId(suffix) || names.has(document.name)) {
          providerFailure();
        }
        names.add(document.name);
        if (mode === "emulator") {
          rememberEmulatorRead(transaction, document.name, {
            updateTime: updateTime(document),
          });
        }
        records.push(recordFromDocument(document));
      }
      if (limit !== undefined && records.length > limit) providerFailure();
      return records;
    },
    async queryStoreProducts(storeId) {
      assertDocumentId(storeId);
      const prefix = `${resourceRoot}/products/`;
      const entries = await streamedJson(
        await post(":runQuery", {
          structuredQuery: {
            from: [{ collectionId: "products" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "storeId" },
                op: "EQUAL",
                value: { stringValue: storeId },
              },
            },
          },
        }),
      );
      const records: FirestoreRecord[] = [];
      const names = new Set<string>();
      for (const entry of entries) {
        if (!plainObject(entry)) providerFailure();
        if (entry.document === undefined) {
          if (entry.readTime === undefined && entry.done !== true) {
            providerFailure();
          }
          continue;
        }
        const document = documentFromPayload(entry.document);
        if (!document.name.startsWith(prefix)) providerFailure();
        const suffix = document.name.slice(prefix.length);
        if (!safeDocumentId(suffix) || names.has(document.name)) {
          providerFailure();
        }
        names.add(document.name);
        records.push(recordFromDocument(document));
      }
      return records;
    },
    async queryAdminUserIds() {
      const entries = await streamedJson(
        await post(":runQuery", {
          structuredQuery: {
            from: [{ collectionId: "users" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "role" },
                op: "EQUAL",
                value: { stringValue: "admin" },
              },
            },
          },
        }),
      );
      const prefix = `${resourceRoot}/users/`;
      const ids: string[] = [];
      const names = new Set<string>();
      for (const entry of entries) {
        if (!plainObject(entry)) providerFailure();
        if (entry.document === undefined) {
          if (entry.readTime === undefined && entry.done !== true) {
            providerFailure();
          }
          continue;
        }
        const document = documentFromPayload(entry.document);
        if (!document.name.startsWith(prefix) || names.has(document.name)) {
          providerFailure();
        }
        const id = document.name.slice(prefix.length);
        if (!safeDocumentId(id)) providerFailure();
        names.add(document.name);
        const record = recordFromDocument(document);
        if (record.role !== "admin") providerFailure();
        ids.push(id);
      }
      return ids;
    },
    async commit(transaction, writes) {
      transactionToken(transaction);
      if (mode === "hosted") {
        await checkedJson(await post(":commit", { writes, transaction }));
        return;
      }
      const readSet = emulatorReadSet(transaction);
      const mutated = new Set<string>();
      const guardedWrites = writes.map((write) => {
        const name = write.update?.name ?? write.delete;
        if (!name) return write;
        if (mutated.has(name)) providerFailure();
        mutated.add(name);
        const precondition = readSet.get(name);
        if (
          precondition && write.currentDocument &&
          "exists" in write.currentDocument &&
          write.currentDocument.exists === true
        ) {
          return { ...write, currentDocument: precondition };
        }
        return write;
      });
      for (const [name, currentDocument] of readSet) {
        if (!mutated.has(name)) {
          guardedWrites.push({ verify: name, currentDocument });
        }
      }
      const readAbsenceCreate = guardedWrites.some((write) => {
        const name = write.update?.name;
        const read = name ? readSet.get(name) : undefined;
        return read !== undefined && "exists" in read &&
          read.exists === false &&
          write.currentDocument !== undefined &&
          "exists" in write.currentDocument &&
          write.currentDocument.exists === false;
      });
      try {
        await checkedJson(await post(":commit", { writes: guardedWrites }));
      } catch (error) {
        if (
          error instanceof FirestoreRestProviderError &&
          (error.code === "failed-precondition" ||
            (error.code === "already-exists" && readAbsenceCreate))
        ) {
          throw new FirestoreRestProviderError("aborted");
        }
        throw error;
      } finally {
        emulatorTransactions.delete(transaction);
      }
    },
    async commitWrites(writes) {
      if (!Array.isArray(writes) || writes.length < 1 || writes.length > 500) {
        throw new TypeError("Firestore write batch is invalid.");
      }
      await checkedJson(await post(":commit", { writes }));
    },
    async rollback(transaction) {
      transactionToken(transaction);
      if (mode === "emulator") {
        if (!emulatorTransactions.delete(transaction)) providerFailure();
        return;
      }
      await checkedJson(await post(":rollback", { transaction }));
    },
  };
  return Object.freeze(client);
}

export function createHostedFirestoreRestClient(
  options: HostedClientOptions,
): FirestoreRestClient {
  if (
    !isValidHostedProjectId(options.projectId) ||
    options.databaseId !== FIRESTORE_DATABASE_ID ||
    typeof options.getAccessToken !== "function"
  ) {
    throw new Error("Hosted Firestore REST configuration is invalid.");
  }
  return createClient({
    projectId: options.projectId,
    mode: "hosted",
    documentsRoot: hostedFirestoreRestRoot(
      options.projectId,
      options.databaseId,
    ),
    fetcher: options.fetcher,
    getAccessToken: options.getAccessToken,
    fetchTimeoutMs: options.fetchTimeoutMs,
  });
}

export function createEmulatorFirestoreRestClient(
  options: EmulatorClientOptions,
): FirestoreRestClient {
  if (
    options.projectId !== LOCAL_PROJECT_ID ||
    options.databaseId !== FIRESTORE_DATABASE_ID
  ) {
    throw new Error("Firestore Emulator REST configuration is invalid.");
  }
  const emulatorHost = assertLoopbackEmulatorEndpoint(
    options.emulatorHost,
    "Firestore Emulator",
  );
  return createClient({
    projectId: LOCAL_PROJECT_ID,
    mode: "emulator",
    documentsRoot:
      `http://${emulatorHost}/v1/projects/${LOCAL_PROJECT_ID}/databases/(default)/documents`,
    fetcher: options.fetcher,
    fetchTimeoutMs: options.fetchTimeoutMs,
  });
}
