import { redirect } from "next/navigation";
import { auth } from "@/src/lib/auth";
import { getOAuthSettings } from "@/src/lib/settings";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/");
  }

  const settings = getOAuthSettings();
  const oauthConfigured = Boolean(settings);

  // Determine provider ID based on settings
  const providerId = settings?.providerType === "authentik" ? "authentik" : "oauth";

  return <LoginClient oauthConfigured={oauthConfigured} providerId={providerId} />;
}
