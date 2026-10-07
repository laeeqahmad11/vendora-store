import { createTrustedCommerceOperations } from "../../functions/trusted/operations.js";
import { createVendoraApiHandler } from "./handler.js";
import { createFirebaseIdTokenResolver } from "./firebase-id-token.ts";
import { createFirebaseAppCheckVerifier } from "./firebase-app-check.ts";
import {
  assertFirestoreRestRepository,
  type FirestoreRestRepositoryFactory,
} from "./firestore-rest-contract.ts";
import { createFirestoreRestCommerceRepository } from "./firestore-rest-repository.ts";
import { createServiceAccountAccessTokenProvider } from "./google-oauth.ts";
import {
  assertHostedRuntime,
  HOSTED_APP_CHECK_PROJECT_NUMBER_ENV,
  HOSTED_CREDENTIAL_ENV,
  HOSTED_ORIGINS_ENV,
  type HostedEnvironment,
} from "./hosted-runtime.ts";
import { sha256Hex } from "./sha256.ts";

const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Handler = (request: Request) => Promise<Response>;
type Serve = (handler: Handler) => unknown;
type EnvironmentValueReader = (name: string) => string | undefined;
type RequestLogEntry = Readonly<Record<string, string | number>>;
type RequestLogger = (entry: RequestLogEntry) => void;
type HandlerFactory = (options: {
  readonly trustedCommerce: ReturnType<typeof createTrustedCommerceOperations>;
  readonly resolveActor: ReturnType<typeof createFirebaseIdTokenResolver>;
  readonly verifyAppCheck: ReturnType<typeof createFirebaseAppCheckVerifier>;
  readonly allowedOrigins: readonly string[];
  readonly logRequest: RequestLogger;
}) => Handler;

export interface HostedVendoraOptions {
  readonly environment: HostedEnvironment;
  readonly createRepository: FirestoreRestRepositoryFactory;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly logRequest?: RequestLogger;
}

export interface HostedVendoraRuntime {
  readonly projectId: string;
  readonly allowedOrigins: readonly string[];
  readonly handle: Handler;
}

export interface ServeHostedVendoraOptions
  extends Omit<HostedVendoraOptions, "environment"> {
  readonly environment?: HostedEnvironment;
  readonly serve?: Serve;
}

function orderNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let suffix = "";
  for (const byte of bytes) {
    suffix += ORDER_ALPHABET[byte % ORDER_ALPHABET.length];
  }
  return `VND-${suffix}`;
}

export function logHostedRequest(entry: RequestLogEntry): void {
  console.info(JSON.stringify(entry));
}

export function readHostedEnvironment(
  readValue: EnvironmentValueReader = (name) => Deno.env.get(name),
): HostedEnvironment {
  if (typeof readValue !== "function") {
    throw new TypeError("Vendora hosted environment reader is unavailable.");
  }
  return Object.freeze({
    GCLOUD_PROJECT: readValue("GCLOUD_PROJECT"),
    GOOGLE_CLOUD_PROJECT: readValue("GOOGLE_CLOUD_PROJECT"),
    [HOSTED_ORIGINS_ENV]: readValue(HOSTED_ORIGINS_ENV),
    [HOSTED_CREDENTIAL_ENV]: readValue(HOSTED_CREDENTIAL_ENV),
    [HOSTED_APP_CHECK_PROJECT_NUMBER_ENV]: readValue(
      HOSTED_APP_CHECK_PROJECT_NUMBER_ENV,
    ),
  });
}

export async function createHostedVendoraRuntime({
  environment,
  createRepository,
  fetcher = globalThis.fetch,
  now = Date.now,
  logRequest = logHostedRequest,
}: HostedVendoraOptions): Promise<HostedVendoraRuntime> {
  if (
    typeof createRepository !== "function" || typeof fetcher !== "function" ||
    typeof now !== "function" || typeof logRequest !== "function"
  ) {
    throw new TypeError("Vendora hosted runtime dependencies are unavailable.");
  }
  const hosted = assertHostedRuntime(environment);
  const getAccessToken = await createServiceAccountAccessTokenProvider({
    projectId: hosted.projectId,
    credentialJson: hosted.credentialJson,
    fetcher,
    now,
  });
  const repository = assertFirestoreRestRepository(createRepository({
    projectId: hosted.projectId,
    databaseId: "(default)",
    fetcher,
    getAccessToken,
  }));
  const trustedCommerce = createTrustedCommerceOperations({
    repository,
    createOrderNumber: orderNumber,
    digest: sha256Hex,
    now,
  });
  return Object.freeze({
    projectId: hosted.projectId,
    allowedOrigins: hosted.allowedOrigins,
    handle: (createVendoraApiHandler as unknown as HandlerFactory)({
      trustedCommerce,
      resolveActor: createFirebaseIdTokenResolver({
        projectId: hosted.projectId,
        fetcher,
        now,
      }),
      verifyAppCheck: createFirebaseAppCheckVerifier({
        projectNumber: hosted.appCheckProjectNumber,
        fetcher,
        now,
      }),
      allowedOrigins: hosted.allowedOrigins,
      logRequest,
    }),
  });
}

export async function serveHostedVendoraApi({
  environment = readHostedEnvironment(),
  serve = (handler) => Deno.serve(handler),
  ...options
}: ServeHostedVendoraOptions): Promise<unknown> {
  const runtime = await createHostedVendoraRuntime({ ...options, environment });
  return serve(runtime.handle);
}

if (import.meta.main) {
  await serveHostedVendoraApi({
    createRepository: createFirestoreRestCommerceRepository,
  });
}
