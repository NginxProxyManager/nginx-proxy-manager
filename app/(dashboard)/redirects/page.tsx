import RedirectsClient from "./RedirectsClient";
import { listRedirectHosts } from "@/src/lib/models/redirect-hosts";

export default async function RedirectsPage() {
  const redirects = await listRedirectHosts();
  return <RedirectsClient redirects={redirects} />;
}
