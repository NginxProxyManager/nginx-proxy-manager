import ProxyHostsClient from "./ProxyHostsClient";
import { listProxyHosts } from "@/src/lib/models/proxy-hosts";
import { listCertificates } from "@/src/lib/models/certificates";
import { listAccessLists } from "@/src/lib/models/access-lists";

export default async function ProxyHostsPage() {
  const [hosts, certificates, accessLists] = await Promise.all([
    listProxyHosts(),
    listCertificates(),
    listAccessLists()
  ]);

  return <ProxyHostsClient hosts={hosts} certificates={certificates} accessLists={accessLists} />;
}
