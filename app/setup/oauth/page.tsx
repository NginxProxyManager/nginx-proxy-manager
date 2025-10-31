import { redirect } from "next/navigation";
import { getOAuthSettings } from "@/src/lib/settings";
import { getUserCount } from "@/src/lib/models/user";
import { initialOAuthSetupAction } from "./actions";
import OAuthSetupClient from "./SetupClient";

export default function OAuthSetupPage() {
  // Only redirect if BOTH users exist AND OAuth is configured
  // This allows reconfiguring OAuth even if users exist
  const hasUsers = getUserCount() > 0;
  const hasOAuth = getOAuthSettings();

  if (hasUsers && hasOAuth) {
    redirect("/login");
  }

  return <OAuthSetupClient startSetup={initialOAuthSetupAction} />;
}
