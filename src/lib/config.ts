const DEV_SECRET = "dev-secret-change-in-production-12345678901234567890123456789012";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
const DISALLOWED_SESSION_SECRETS = new Set([DEV_SECRET, "change-me-in-production"]);
const DEFAULT_CADDY_URL = process.env.NODE_ENV === "development" ? "http://localhost:2019" : "http://caddy:2019";
const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

const isProduction = process.env.NODE_ENV === "production";
const isNodeRuntime = process.env.NEXT_RUNTIME === "nodejs";
const allowDevFallback = !isProduction || !isNodeRuntime;
const isRuntimeProduction = isProduction && isNodeRuntime;

function resolveSessionSecret(): string {
  const rawSecret = process.env.SESSION_SECRET ?? null;
  const secret = rawSecret?.trim();

  if (!secret) {
    if (allowDevFallback) {
      return DEV_SECRET;
    }
    throw new Error("SESSION_SECRET must be set to a strong value in production environments.");
  }

  if (isRuntimeProduction && DISALLOWED_SESSION_SECRETS.has(secret)) {
    throw new Error("SESSION_SECRET is using a known insecure placeholder value. Provide a unique secret.");
  }

  if (isRuntimeProduction && secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters long in production.`);
  }

  return secret;
}

function resolveAdminCredentials() {
  const rawUsername = process.env.ADMIN_USERNAME ?? (allowDevFallback ? DEFAULT_ADMIN_USERNAME : undefined);
  const rawPassword = process.env.ADMIN_PASSWORD ?? (allowDevFallback ? DEFAULT_ADMIN_PASSWORD : undefined);
  const username = rawUsername?.trim();
  const password = rawPassword?.trim();

  if (!username) {
    throw new Error("ADMIN_USERNAME must be configured.");
  }

  if (!password) {
    throw new Error("ADMIN_PASSWORD must be configured.");
  }

  if (isRuntimeProduction) {
    if (username === DEFAULT_ADMIN_USERNAME) {
      throw new Error("ADMIN_USERNAME must be changed from the default value when running in production.");
    }
    if (password === DEFAULT_ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD must be changed from the default value when running in production.");
    }
    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
      throw new Error(`ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters long in production.`);
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error("ADMIN_PASSWORD must include both letters and numbers for adequate complexity.");
    }
  }

  return { username, password };
}

const adminCredentials = resolveAdminCredentials();

export const config = {
  sessionSecret: resolveSessionSecret(),
  caddyApiUrl: process.env.CADDY_API_URL ?? DEFAULT_CADDY_URL,
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  adminUsername: adminCredentials.username,
  adminPassword: adminCredentials.password
};
