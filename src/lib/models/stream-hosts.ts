import db, { nowIso } from "../db";
import { logAuditEvent } from "../audit";
import { applyCaddyConfig } from "../caddy";

export type StreamHost = {
  id: number;
  name: string;
  listen_port: number;
  protocol: string;
  upstream: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type StreamHostInput = {
  name: string;
  listen_port: number;
  protocol: string;
  upstream: string;
  enabled?: boolean;
};

function parse(row: any): StreamHost {
  return {
    id: row.id,
    name: row.name,
    listen_port: row.listen_port,
    protocol: row.protocol,
    upstream: row.upstream,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listStreamHosts(): StreamHost[] {
  const rows = db
    .prepare(
      `SELECT id, name, listen_port, protocol, upstream, enabled, created_at, updated_at
       FROM stream_hosts ORDER BY created_at DESC`
    )
    .all();
  return rows.map(parse);
}

export function getStreamHost(id: number): StreamHost | null {
  const row = db
    .prepare(
      `SELECT id, name, listen_port, protocol, upstream, enabled, created_at, updated_at
       FROM stream_hosts WHERE id = ?`
    )
    .get(id);
  return row ? parse(row) : null;
}

function assertProtocol(protocol: string) {
  if (!["tcp", "udp"].includes(protocol.toLowerCase())) {
    throw new Error("Protocol must be tcp or udp");
  }
}

export async function createStreamHost(input: StreamHostInput, actorUserId: number) {
  assertProtocol(input.protocol);
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO stream_hosts (name, listen_port, protocol, upstream, enabled, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.listen_port,
      input.protocol.toLowerCase(),
      input.upstream.trim(),
      (input.enabled ?? true) ? 1 : 0,
      now,
      now,
      actorUserId
    );
  const id = Number(result.lastInsertRowid);
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "stream_host",
    entityId: id,
    summary: `Created stream ${input.name}`
  });
  await applyCaddyConfig();
  return getStreamHost(id)!;
}

export async function updateStreamHost(id: number, input: Partial<StreamHostInput>, actorUserId: number) {
  const existing = getStreamHost(id);
  if (!existing) {
    throw new Error("Stream host not found");
  }
  const protocol = input.protocol ? input.protocol.toLowerCase() : existing.protocol;
  assertProtocol(protocol);
  const now = nowIso();
  db.prepare(
    `UPDATE stream_hosts
     SET name = ?, listen_port = ?, protocol = ?, upstream = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    input.listen_port ?? existing.listen_port,
    protocol,
    input.upstream ?? existing.upstream,
    (input.enabled ?? existing.enabled) ? 1 : 0,
    now,
    id
  );
  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "stream_host",
    entityId: id,
    summary: `Updated stream ${input.name ?? existing.name}`
  });
  await applyCaddyConfig();
  return getStreamHost(id)!;
}

export async function deleteStreamHost(id: number, actorUserId: number) {
  const existing = getStreamHost(id);
  if (!existing) {
    throw new Error("Stream host not found");
  }
  db.prepare("DELETE FROM stream_hosts WHERE id = ?").run(id);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "stream_host",
    entityId: id,
    summary: `Deleted stream ${existing.name}`
  });
  await applyCaddyConfig();
}
