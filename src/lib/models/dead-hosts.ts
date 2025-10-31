import db, { nowIso } from "../db";
import { logAuditEvent } from "../audit";
import { applyCaddyConfig } from "../caddy";

export type DeadHost = {
  id: number;
  name: string;
  domains: string[];
  status_code: number;
  response_body: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type DeadHostInput = {
  name: string;
  domains: string[];
  status_code?: number;
  response_body?: string | null;
  enabled?: boolean;
};

function parse(row: any): DeadHost {
  return {
    id: row.id,
    name: row.name,
    domains: JSON.parse(row.domains),
    status_code: row.status_code,
    response_body: row.response_body,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listDeadHosts(): DeadHost[] {
  const rows = db
    .prepare(
      `SELECT id, name, domains, status_code, response_body, enabled, created_at, updated_at
       FROM dead_hosts ORDER BY created_at DESC`
    )
    .all();
  return rows.map(parse);
}

export function getDeadHost(id: number): DeadHost | null {
  const row = db
    .prepare(
      `SELECT id, name, domains, status_code, response_body, enabled, created_at, updated_at
       FROM dead_hosts WHERE id = ?`
    )
    .get(id);
  return row ? parse(row) : null;
}

export async function createDeadHost(input: DeadHostInput, actorUserId: number) {
  if (!input.domains || input.domains.length === 0) {
    throw new Error("At least one domain is required");
  }

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO dead_hosts (name, domains, status_code, response_body, enabled, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      JSON.stringify(Array.from(new Set(input.domains.map((d) => d.trim().toLowerCase())))),
      input.status_code ?? 503,
      input.response_body ?? null,
      (input.enabled ?? true) ? 1 : 0,
      now,
      now,
      actorUserId
    );
  const id = Number(result.lastInsertRowid);
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "dead_host",
    entityId: id,
    summary: `Created dead host ${input.name}`
  });
  await applyCaddyConfig();
  return getDeadHost(id)!;
}

export async function updateDeadHost(id: number, input: Partial<DeadHostInput>, actorUserId: number) {
  const existing = getDeadHost(id);
  if (!existing) {
    throw new Error("Dead host not found");
  }
  const now = nowIso();
  db.prepare(
    `UPDATE dead_hosts
     SET name = ?, domains = ?, status_code = ?, response_body = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    JSON.stringify(input.domains ? Array.from(new Set(input.domains)) : existing.domains),
    input.status_code ?? existing.status_code,
    input.response_body ?? existing.response_body,
    (input.enabled ?? existing.enabled) ? 1 : 0,
    now,
    id
  );
  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "dead_host",
    entityId: id,
    summary: `Updated dead host ${input.name ?? existing.name}`
  });
  await applyCaddyConfig();
  return getDeadHost(id)!;
}

export async function deleteDeadHost(id: number, actorUserId: number) {
  const existing = getDeadHost(id);
  if (!existing) {
    throw new Error("Dead host not found");
  }
  db.prepare("DELETE FROM dead_hosts WHERE id = ?").run(id);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "dead_host",
    entityId: id,
    summary: `Deleted dead host ${existing.name}`
  });
  await applyCaddyConfig();
}
