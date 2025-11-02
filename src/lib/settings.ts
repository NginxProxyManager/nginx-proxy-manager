import prisma, { nowIso } from "./db";

export type SettingValue<T> = T | null;

export type CloudflareSettings = {
  apiToken: string;
  zoneId?: string;
  accountId?: string;
};

export type GeneralSettings = {
  primaryDomain: string;
  acmeEmail?: string;
};

export async function getSetting<T>(key: string): Promise<SettingValue<T>> {
  const setting = await prisma.setting.findUnique({
    where: { key }
  });

  if (!setting) {
    return null;
  }

  try {
    return JSON.parse(setting.value) as T;
  } catch (error) {
    console.warn(`Failed to parse setting ${key}`, error);
    return null;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const payload = JSON.stringify(value);
  const now = new Date(nowIso());

  await prisma.setting.upsert({
    where: { key },
    update: {
      value: payload,
      updatedAt: now
    },
    create: {
      key,
      value: payload,
      updatedAt: now
    }
  });
}

export async function getCloudflareSettings(): Promise<CloudflareSettings | null> {
  return await getSetting<CloudflareSettings>("cloudflare");
}

export async function saveCloudflareSettings(settings: CloudflareSettings): Promise<void> {
  await setSetting("cloudflare", settings);
}

export async function getGeneralSettings(): Promise<GeneralSettings | null> {
  return await getSetting<GeneralSettings>("general");
}

export async function saveGeneralSettings(settings: GeneralSettings): Promise<void> {
  await setSetting("general", settings);
}
