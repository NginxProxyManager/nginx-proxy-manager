import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth/session";
import { buildAuthorizationUrl } from "@/src/lib/auth/oauth";
import { getOAuthSettings } from "@/src/lib/settings";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const oauthConfigured = Boolean(getOAuthSettings());

  async function startOAuth() {
    "use server";
    const target = buildAuthorizationUrl("/");
    redirect(target);
  }

  return <LoginClient oauthConfigured={oauthConfigured} startOAuth={startOAuth} />;
}
