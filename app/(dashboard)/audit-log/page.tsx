import AuditLogClient from "./AuditLogClient";
import { listAuditEvents } from "@/src/lib/models/audit";
import { listUsers } from "@/src/lib/models/user";

export default async function AuditLogPage() {
  const events = await listAuditEvents(200);
  const users = await listUsers();
  const userMap = new Map(users.map((user) => [user.id, user]));

  return (
    <AuditLogClient
      events={events.map((event) => ({
        id: event.id,
        created_at: event.created_at,
        summary: event.summary ?? `${event.action} on ${event.entity_type}`,
        user: event.user_id ? userMap.get(event.user_id)?.name ?? userMap.get(event.user_id)?.email ?? "System" : "System"
      }))}
    />
  );
}
