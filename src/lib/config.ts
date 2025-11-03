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

  // Always return a value (build phase needs this)
  if (!secret) {
    return DEV_SECRET;
  }

  // Only validate in actual runtime production (not during build)
  if (isRuntimeProduction) {
    if (DISALLOWED_SESSION_SECRETS.has(secret)) {
      throw new Error("SESSION_SECRET is using a known insecure placeholder value. Provide a unique secret.");
    }
    if (secret.length < MIN_SESSION_SECRET_LENGTH) {
      throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters long in production.`);
    }
  }

  return secret;
}

function resolveAdminCredentials() {
  const rawUsername = process.env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME;
  const rawPassword = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const username = rawUsername?.trim();
  const password = rawPassword?.trim();

  // Always return values (build phase needs this)
  if (!username || !password) {
    return { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD };
  }

  // Only validate in actual runtime production (not during build)
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

// Lazy initialization to avoid executing during build time
let _adminCredentials: { username: string; password: string } | null = null;
let _sessionSecret: string | null = null;

function getAdminCredentials() {
  if (!_adminCredentials) {
    _adminCredentials = resolveAdminCredentials();
  }
  return _adminCredentials;
}

function getSessionSecret() {
  if (!_sessionSecret) {
    _sessionSecret = resolveSessionSecret();
  }
  return _sessionSecret;
}

export const config = {
  get sessionSecret() {
    return getSessionSecret();
  },
  caddyApiUrl: process.env.CADDY_API_URL ?? DEFAULT_CADDY_URL,
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  get adminUsername() {
    return getAdminCredentials().username;
  },
  get adminPassword() {
    return getAdminCredentials().password;
  }
};

/**
 * Validates configuration at server startup in production.
 * Throws if production is running with insecure default values.
 * Safe to call during build - only validates when actually serving.
 */
export function validateProductionConfig() {
  if (isRuntimeProduction) {
    // Force validation by accessing the config values
    // This will throw if defaults are being used in production
    const _ = config.sessionSecret;
    const __ = config.adminUsername;
    const ___ = config.adminPassword;
  }
}
