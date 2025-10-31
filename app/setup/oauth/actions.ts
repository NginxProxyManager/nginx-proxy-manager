"use server";

import { redirect } from "next/navigation";
import { getUserCount } from "@/src/lib/models/user";
import { saveOAuthSettings } from "@/src/lib/settings";

export async function initialOAuthSetupAction(formData: FormData) {
  // Allow reconfiguring OAuth even if users exist (in case settings were lost)
  // Just save the settings and redirect
  const providerType = String(formData.get("providerType") ?? "authentik");

  saveOAuthSettings({
    providerType: providerType === "generic" ? "generic" : "authentik",
    authorizationUrl: String(formData.get("authorizationUrl") ?? ""),
    tokenUrl: String(formData.get("tokenUrl") ?? ""),
    userInfoUrl: String(formData.get("userInfoUrl") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    clientSecret: String(formData.get("clientSecret") ?? ""),
    scopes: String(formData.get("scopes") ?? ""),
    emailClaim: formData.get("emailClaim") ? String(formData.get("emailClaim")) : undefined,
    nameClaim: formData.get("nameClaim") ? String(formData.get("nameClaim")) : undefined,
    avatarClaim: formData.get("avatarClaim") ? String(formData.get("avatarClaim")) : undefined
  });
  redirect("/login");
}
