"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/src/lib/auth";
import { applyCaddyConfig } from "@/src/lib/caddy";
import { saveCloudflareSettings, saveGeneralSettings } from "@/src/lib/settings";

type ActionResult = {
  success: boolean;
  message?: string;
};

export async function updateGeneralSettingsAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    saveGeneralSettings({
      primaryDomain: String(formData.get("primaryDomain") ?? ""),
      acmeEmail: formData.get("acmeEmail") ? String(formData.get("acmeEmail")) : undefined
    });
    revalidatePath("/settings");
    return { success: true, message: "General settings saved successfully" };
  } catch (error) {
    console.error("Failed to save general settings:", error);
    return { success: false, message: error instanceof Error ? error.message : "Failed to save general settings" };
  }
}

export async function updateCloudflareSettingsAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
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

    // Try to apply the config, but don't fail if Caddy is unreachable
    try {
      await applyCaddyConfig();
      revalidatePath("/settings");
      return { success: true, message: "Cloudflare settings saved and applied to Caddy successfully" };
    } catch (error) {
      console.error("Failed to apply Caddy config:", error);
      revalidatePath("/settings");
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return {
        success: true, // Settings were saved successfully
        message: `Settings saved, but could not apply to Caddy: ${errorMsg}. You may need to start Caddy or check your configuration.`
      };
    }
  } catch (error) {
    console.error("Failed to save Cloudflare settings:", error);
    return { success: false, message: error instanceof Error ? error.message : "Failed to save Cloudflare settings" };
  }
}
