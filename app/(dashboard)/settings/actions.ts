"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth/session";
import { applyCaddyConfig } from "@/src/lib/caddy";
import { saveCloudflareSettings, saveGeneralSettings, saveOAuthSettings } from "@/src/lib/settings";

export async function updateGeneralSettingsAction(formData: FormData) {
  requireUser(); // ensure authenticated
  saveGeneralSettings({
    primaryDomain: String(formData.get("primaryDomain") ?? ""),
    acmeEmail: formData.get("acmeEmail") ? String(formData.get("acmeEmail")) : undefined
  });
  revalidatePath("/settings");
}

export async function updateOAuthSettingsAction(formData: FormData) {
  requireUser();
  saveOAuthSettings({
    authorizationUrl: String(formData.get("authorizationUrl") ?? ""),
    tokenUrl: String(formData.get("tokenUrl") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    clientSecret: String(formData.get("clientSecret") ?? ""),
    userInfoUrl: String(formData.get("userInfoUrl") ?? ""),
    scopes: String(formData.get("scopes") ?? ""),
    emailClaim: formData.get("emailClaim") ? String(formData.get("emailClaim")) : undefined,
    nameClaim: formData.get("nameClaim") ? String(formData.get("nameClaim")) : undefined,
    avatarClaim: formData.get("avatarClaim") ? String(formData.get("avatarClaim")) : undefined
  });
  revalidatePath("/settings");
}

export async function updateCloudflareSettingsAction(formData: FormData) {
  requireUser();
  const apiToken = String(formData.get("apiToken") ?? "");
  if (!apiToken) {
    saveCloudflareSettings({ apiToken: "", zoneId: undefined, accountId: undefined });
  } else {
    saveCloudflareSettings({
      apiToken,
      zoneId: formData.get("zoneId") ? String(formData.get("zoneId")) : undefined,
      accountId: formData.get("accountId") ? String(formData.get("accountId")) : undefined
    });
  }
  await applyCaddyConfig();
  revalidatePath("/settings");
}
