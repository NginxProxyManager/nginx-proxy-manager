import crypto from "node:crypto";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

// Generate a stable development secret (WARNING: only for development!)
// In production, SESSION_SECRET must be set in environment variables
const DEV_SECRET = "dev-secret-change-in-production-12345678901234567890123456789012";
const DEFAULT_CADDY_URL = process.env.NODE_ENV === "development" ? "http://localhost:2019" : "http://caddy:2019";

// During build time or in development, use DEV_SECRET as fallback
// In production runtime, SESSION_SECRET must be set
const isProduction = process.env.NODE_ENV === "production";
const isBuildTime = typeof window === "undefined" && !process.env.SESSION_SECRET;

export const config = {
  sessionSecret: requireEnv("SESSION_SECRET", !isProduction || isBuildTime ? DEV_SECRET : undefined),
  caddyApiUrl: process.env.CADDY_API_URL ?? DEFAULT_CADDY_URL,
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin"
};
