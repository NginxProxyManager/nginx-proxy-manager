import db from "../db";

export type AuditEvent = {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string | null;
  created_at: string;
};

export function listAuditEvents(limit = 100): AuditEvent[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, action, entity_type, entity_id, summary, created_at
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as AuditEvent[];
  return rows;
}
