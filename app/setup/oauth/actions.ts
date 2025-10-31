"use server";

import { redirect } from "next/navigation";
import { getUserCount } from "@/src/lib/models/user";
import { saveOAuthSettings } from "@/src/lib/settings";

export async function initialOAuthSetupAction(formData: FormData) {
  if (getUserCount() > 0) {
    redirect("/login");
  }
  saveOAuthSettings({
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
