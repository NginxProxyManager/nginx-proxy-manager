import DeadHostsClient from "./DeadHostsClient";
import { listDeadHosts } from "@/src/lib/models/dead-hosts";

export default async function DeadHostsPage() {
  const hosts = await listDeadHosts();
  return <DeadHostsClient hosts={hosts} />;
}
