import db, { nowIso } from "../db";
import { logAuditEvent } from "../audit";
import { applyCaddyConfig } from "../caddy";

export type RedirectHost = {
  id: number;
  name: string;
  domains: string[];
  destination: string;
  status_code: number;
  preserve_query: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type RedirectHostInput = {
  name: string;
  domains: string[];
  destination: string;
  status_code?: number;
  preserve_query?: boolean;
  enabled?: boolean;
};

function parse(row: any): RedirectHost {
  return {
    id: row.id,
    name: row.name,
    domains: JSON.parse(row.domains),
    destination: row.destination,
    status_code: row.status_code,
    preserve_query: Boolean(row.preserve_query),
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listRedirectHosts(): RedirectHost[] {
  const rows = db
    .prepare(
      `SELECT id, name, domains, destination, status_code, preserve_query, enabled, created_at, updated_at
       FROM redirect_hosts ORDER BY created_at DESC`
    )
    .all();
  return rows.map(parse);
}

export function getRedirectHost(id: number): RedirectHost | null {
  const row = db
    .prepare(
      `SELECT id, name, domains, destination, status_code, preserve_query, enabled, created_at, updated_at
       FROM redirect_hosts WHERE id = ?`
    )
    .get(id);
  return row ? parse(row) : null;
}

export async function createRedirectHost(input: RedirectHostInput, actorUserId: number) {
  if (!input.domains || input.domains.length === 0) {
    throw new Error("At least one domain is required");
  }

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO redirect_hosts (name, domains, destination, status_code, preserve_query, enabled, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      JSON.stringify(Array.from(new Set(input.domains.map((d) => d.trim().toLowerCase())))),
      input.destination.trim(),
      input.status_code ?? 302,
      input.preserve_query ? 1 : 0,
      (input.enabled ?? true) ? 1 : 0,
      now,
      now,
      actorUserId
    );
  const id = Number(result.lastInsertRowid);
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "redirect_host",
    entityId: id,
    summary: `Created redirect ${input.name}`
  });
  await applyCaddyConfig();
  return getRedirectHost(id)!;
}

export async function updateRedirectHost(id: number, input: Partial<RedirectHostInput>, actorUserId: number) {
  const existing = getRedirectHost(id);
  if (!existing) {
    throw new Error("Redirect host not found");
  }

  const now = nowIso();
  db.prepare(
    `UPDATE redirect_hosts
     SET name = ?, domains = ?, destination = ?, status_code = ?, preserve_query = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    JSON.stringify(input.domains ? Array.from(new Set(input.domains)) : existing.domains),
    input.destination ?? existing.destination,
    input.status_code ?? existing.status_code,
    (input.preserve_query ?? existing.preserve_query) ? 1 : 0,
    (input.enabled ?? existing.enabled) ? 1 : 0,
    now,
    id
  );

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "redirect_host",
    entityId: id,
    summary: `Updated redirect ${input.name ?? existing.name}`
  });
  await applyCaddyConfig();
  return getRedirectHost(id)!;
}

export async function deleteRedirectHost(id: number, actorUserId: number) {
  const existing = getRedirectHost(id);
  if (!existing) {
    throw new Error("Redirect host not found");
  }
  db.prepare("DELETE FROM redirect_hosts WHERE id = ?").run(id);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "redirect_host",
    entityId: id,
    summary: `Deleted redirect ${existing.name}`
  });
  await applyCaddyConfig();
}
