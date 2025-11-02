import AccessListsClient from "./AccessListsClient";
import { listAccessLists } from "@/src/lib/models/access-lists";

export default async function AccessListsPage() {
  const lists = await listAccessLists();
  return <AccessListsClient lists={lists} />;
}
