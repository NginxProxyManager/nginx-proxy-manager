import RedirectsClient from "./RedirectsClient";
import { listRedirectHosts } from "@/src/lib/models/redirect-hosts";

export default function RedirectsPage() {
  const redirects = listRedirectHosts();
  return <RedirectsClient redirects={redirects} />;
}
