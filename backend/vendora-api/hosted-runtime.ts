export const HOSTED_CREDENTIAL_ENV = "VENDORA_GOOGLE_SERVICE_ACCOUNT_JSON";
export const HOSTED_ORIGINS_ENV = "VENDORA_ALLOWED_ORIGINS";
export const HOSTED_APP_CHECK_PROJECT_NUMBER_ENV =
  "VENDORA_FIREBASE_PROJECT_NUMBER";

const FIREBASE_PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;

export type HostedEnvironment = Readonly<Record<string, string | undefined>>;

export interface HostedRuntime {
  readonly projectId: string;
  readonly appCheckProjectNumber: string;
  readonly allowedOrigins: readonly string[];
  readonly credentialJson: string;
}

function fail(): never {
  throw new Error("Vendora hosted runtime configuration is invalid.");
}

function appCheckProjectNumber(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{5,19}$/u.test(value)) fail();
  return value;
}

export function isValidHostedProjectId(value: unknown): value is string {
  return typeof value === "string" && FIREBASE_PROJECT_ID.test(value);
}

function containsAsciiWhitespaceOrControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 32 || code === 127) return true;
  }
  return false;
}

function exactHttpsOrigin(value: unknown): value is string {
  if (
    typeof value !== "string" || !value || value.trim() !== value ||
    containsAsciiWhitespaceOrControl(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  if (!value) fail();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail();
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > 20 ||
    parsed.some((origin) => !exactHttpsOrigin(origin)) ||
    new Set(parsed).size !== parsed.length
  ) {
    fail();
  }
  return Object.freeze([...parsed] as string[]);
}

function assertCredentialProject(
  credentialJson: string,
  projectId: string,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(credentialJson);
  } catch {
    fail();
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail();
  }
  const credential = parsed as Record<string, unknown>;
  if (
    Object.hasOwn(credential, "project_id") &&
    credential.project_id !== projectId
  ) fail();
}

export function assertHostedRuntime(
  environment: HostedEnvironment,
): HostedRuntime {
  const gcloudProject = environment.GCLOUD_PROJECT;
  const googleCloudProject = environment.GOOGLE_CLOUD_PROJECT;
  const projectId = gcloudProject ?? googleCloudProject;
  if (
    !isValidHostedProjectId(projectId) ||
    (gcloudProject !== undefined && googleCloudProject !== undefined &&
      gcloudProject !== googleCloudProject)
  ) fail();

  const credentialJson = environment[HOSTED_CREDENTIAL_ENV];
  if (typeof credentialJson !== "string" || credentialJson.length === 0) fail();
  assertCredentialProject(credentialJson, projectId);

  return Object.freeze({
    projectId,
    appCheckProjectNumber: appCheckProjectNumber(
      environment[HOSTED_APP_CHECK_PROJECT_NUMBER_ENV],
    ),
    allowedOrigins: parseAllowedOrigins(environment[HOSTED_ORIGINS_ENV]),
    credentialJson,
  });
}
