import ProxyHostsClient from "./ProxyHostsClient";
import { listProxyHosts } from "@/src/lib/models/proxy-hosts";
import { listCertificates } from "@/src/lib/models/certificates";
import { listAccessLists } from "@/src/lib/models/access-lists";

export default function ProxyHostsPage() {
  const hosts = listProxyHosts();
  const certificates = listCertificates();
  const accessLists = listAccessLists();

  return <ProxyHostsClient hosts={hosts} certificates={certificates} accessLists={accessLists} />;
}
