import AccessListsClient from "./AccessListsClient";
import { listAccessLists } from "@/src/lib/models/access-lists";

export default function AccessListsPage() {
  const lists = listAccessLists();
  return <AccessListsClient lists={lists} />;
}
