import crypto from "node:crypto";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const config = {
  sessionSecret: requireEnv("SESSION_SECRET", process.env.NODE_ENV === "development" ? crypto.randomBytes(32).toString("hex") : undefined),
  caddyApiUrl: process.env.CADDY_API_URL ?? "http://caddy:2019",
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000"
};
