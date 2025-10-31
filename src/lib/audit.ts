import db, { nowIso } from "./db";

export function logAuditEvent(params: {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  summary?: string | null;
  data?: unknown;
}) {
  db.prepare(
    `INSERT INTO audit_events (user_id, action, entity_type, entity_id, summary, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.userId ?? null,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.summary ?? null,
    params.data ? JSON.stringify(params.data) : null,
    nowIso()
  );
}
