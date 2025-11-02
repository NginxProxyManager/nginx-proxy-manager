import prisma from "../db";

export type AuditEvent = {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string | null;
  created_at: string;
};

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return events.map((event: typeof events[0]) => ({
    id: event.id,
    user_id: event.userId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    summary: event.summary,
    created_at: event.createdAt.toISOString()
  }));
}
