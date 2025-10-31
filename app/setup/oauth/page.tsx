import { redirect } from "next/navigation";
import { getOAuthSettings } from "@/src/lib/settings";
import { getUserCount } from "@/src/lib/models/user";
import { initialOAuthSetupAction } from "./actions";
import OAuthSetupClient from "./SetupClient";

export default function OAuthSetupPage() {
  if (getUserCount() > 0 && getOAuthSettings()) {
    redirect("/login");
  }

  return <OAuthSetupClient startSetup={initialOAuthSetupAction} />;
}
