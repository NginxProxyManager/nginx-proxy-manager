import DeadHostsClient from "./DeadHostsClient";
import { listDeadHosts } from "@/src/lib/models/dead-hosts";

export default function DeadHostsPage() {
  const hosts = listDeadHosts();
  return <DeadHostsClient hosts={hosts} />;
}
