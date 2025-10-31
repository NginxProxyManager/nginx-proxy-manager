import StreamsClient from "./StreamsClient";
import { listStreamHosts } from "@/src/lib/models/stream-hosts";

export default function StreamsPage() {
  const streams = listStreamHosts();
  return <StreamsClient streams={streams} />;
}
