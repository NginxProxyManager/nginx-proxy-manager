import SettingsClient from "./SettingsClient";
import { getCloudflareSettings, getGeneralSettings, getOAuthSettings } from "@/src/lib/settings";

export default function SettingsPage() {
  return (
    <SettingsClient
      general={getGeneralSettings()}
      oauth={getOAuthSettings()}
      cloudflare={getCloudflareSettings()}
    />
  );
}
