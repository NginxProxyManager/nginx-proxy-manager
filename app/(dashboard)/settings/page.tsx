import SettingsClient from "./SettingsClient";
import { getCloudflareSettings, getGeneralSettings } from "@/src/lib/settings";
import { requireAdmin } from "@/src/lib/auth";

export default async function SettingsPage() {
  await requireAdmin();

  const [general, cloudflare] = await Promise.all([
    getGeneralSettings(),
    getCloudflareSettings()
  ]);

  return (
    <SettingsClient
      general={general}
      cloudflare={cloudflare}
    />
  );
}
