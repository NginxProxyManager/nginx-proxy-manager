import db, { nowIso } from "./db";

export type SettingValue<T> = T | null;

export type OAuthSettings = {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  userInfoUrl: string;
  scopes: string;
  emailClaim?: string;
  nameClaim?: string;
  avatarClaim?: string;
};

export type CloudflareSettings = {
  apiToken: string;
  zoneId?: string;
  accountId?: string;
};

export type GeneralSettings = {
  primaryDomain: string;
  acmeEmail?: string;
};

export function getSetting<T>(key: string): SettingValue<T> {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.value) as T;
  } catch (error) {
    console.warn(`Failed to parse setting ${key}`, error);
    return null;
  }
}

export function setSetting<T>(key: string, value: T) {
  const payload = JSON.stringify(value);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(key, payload, nowIso());
}

export function getOAuthSettings(): OAuthSettings | null {
  return getSetting<OAuthSettings>("oauth");
}

export function saveOAuthSettings(settings: OAuthSettings) {
  setSetting("oauth", settings);
}

export function getCloudflareSettings(): CloudflareSettings | null {
  return getSetting<CloudflareSettings>("cloudflare");
}

export function saveCloudflareSettings(settings: CloudflareSettings) {
  setSetting("cloudflare", settings);
}

export function getGeneralSettings(): GeneralSettings | null {
  return getSetting<GeneralSettings>("general");
}

export function saveGeneralSettings(settings: GeneralSettings) {
  setSetting("general", settings);
}
