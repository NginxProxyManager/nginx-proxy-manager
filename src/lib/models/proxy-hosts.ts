import db, { nowIso } from "../db";
import { applyCaddyConfig } from "../caddy";
import { logAuditEvent } from "../audit";

export type ProxyHost = {
  id: number;
  name: string;
  domains: string[];
  upstreams: string[];
  certificate_id: number | null;
  access_list_id: number | null;
  ssl_forced: boolean;
  hsts_enabled: boolean;
  hsts_subdomains: boolean;
  allow_websocket: boolean;
  preserve_host_header: boolean;
  skip_https_hostname_validation: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ProxyHostInput = {
  name: string;
  domains: string[];
  upstreams: string[];
  certificate_id?: number | null;
  access_list_id?: number | null;
  ssl_forced?: boolean;
  hsts_enabled?: boolean;
  hsts_subdomains?: boolean;
  allow_websocket?: boolean;
  preserve_host_header?: boolean;
  skip_https_hostname_validation?: boolean;
  enabled?: boolean;
};

function parseProxyHost(row: any): ProxyHost {
  return {
    id: row.id,
    name: row.name,
    domains: JSON.parse(row.domains),
    upstreams: JSON.parse(row.upstreams),
    certificate_id: row.certificate_id ?? null,
    access_list_id: row.access_list_id ?? null,
    ssl_forced: Boolean(row.ssl_forced),
    hsts_enabled: Boolean(row.hsts_enabled),
    hsts_subdomains: Boolean(row.hsts_subdomains),
    allow_websocket: Boolean(row.allow_websocket),
    preserve_host_header: Boolean(row.preserve_host_header),
    skip_https_hostname_validation: Boolean(row.skip_https_hostname_validation),
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listProxyHosts(): ProxyHost[] {
  const rows = db
    .prepare(
      `SELECT id, name, domains, upstreams, certificate_id, access_list_id, ssl_forced, hsts_enabled,
              hsts_subdomains, allow_websocket, preserve_host_header, skip_https_hostname_validation,
              enabled, created_at, updated_at
       FROM proxy_hosts
       ORDER BY created_at DESC`
    )
    .all();
  return rows.map(parseProxyHost);
}

export async function createProxyHost(input: ProxyHostInput, actorUserId: number) {
  if (!input.domains || input.domains.length === 0) {
    throw new Error("At least one domain must be specified");
  }
  if (!input.upstreams || input.upstreams.length === 0) {
    throw new Error("At least one upstream must be specified");
  }

  const now = nowIso();
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO proxy_hosts
         (name, domains, upstreams, certificate_id, access_list_id, ssl_forced, hsts_enabled,
          hsts_subdomains, allow_websocket, preserve_host_header, skip_https_hostname_validation,
          enabled, created_at, updated_at, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name.trim(),
        JSON.stringify(Array.from(new Set(input.domains.map((d) => d.trim().toLowerCase())))),
        JSON.stringify(Array.from(new Set(input.upstreams.map((u) => u.trim())))),
        input.certificate_id ?? null,
        input.access_list_id ?? null,
        (input.ssl_forced ?? true) ? 1 : 0,
        (input.hsts_enabled ?? true) ? 1 : 0,
        input.hsts_subdomains ? 1 : 0,
        (input.allow_websocket ?? true) ? 1 : 0,
        (input.preserve_host_header ?? true) ? 1 : 0,
        input.skip_https_hostname_validation ? 1 : 0,
        (input.enabled ?? true) ? 1 : 0,
        now,
        now,
        actorUserId
      );

    const id = Number(result.lastInsertRowid);
    logAuditEvent({
      userId: actorUserId,
      action: "create",
      entityType: "proxy_host",
      entityId: id,
      summary: `Created proxy host ${input.name}`,
      data: input
    });

    return id;
  });

  const id = tx();
  await applyCaddyConfig();
  return getProxyHost(id)!;
}

export function getProxyHost(id: number): ProxyHost | null {
  const row = db
    .prepare(
      `SELECT id, name, domains, upstreams, certificate_id, access_list_id, ssl_forced, hsts_enabled,
              hsts_subdomains, allow_websocket, preserve_host_header, skip_https_hostname_validation,
              enabled, created_at, updated_at
       FROM proxy_hosts WHERE id = ?`
    )
    .get(id);
  if (!row) {
    return null;
  }
  return parseProxyHost(row);
}

export async function updateProxyHost(id: number, input: Partial<ProxyHostInput>, actorUserId: number) {
  const existing = getProxyHost(id);
  if (!existing) {
    throw new Error("Proxy host not found");
  }

  const domains = input.domains ? JSON.stringify(Array.from(new Set(input.domains))) : JSON.stringify(existing.domains);
  const upstreams = input.upstreams ? JSON.stringify(Array.from(new Set(input.upstreams))) : JSON.stringify(existing.upstreams);

  const now = nowIso();
  db.prepare(
    `UPDATE proxy_hosts
     SET name = ?, domains = ?, upstreams = ?, certificate_id = ?, access_list_id = ?, ssl_forced = ?, hsts_enabled = ?,
         hsts_subdomains = ?, allow_websocket = ?, preserve_host_header = ?, skip_https_hostname_validation = ?,
         enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    domains,
    upstreams,
    input.certificate_id ?? existing.certificate_id,
    input.access_list_id ?? existing.access_list_id,
    (input.ssl_forced ?? existing.ssl_forced) ? 1 : 0,
    (input.hsts_enabled ?? existing.hsts_enabled) ? 1 : 0,
    (input.hsts_subdomains ?? existing.hsts_subdomains) ? 1 : 0,
    (input.allow_websocket ?? existing.allow_websocket) ? 1 : 0,
    (input.preserve_host_header ?? existing.preserve_host_header) ? 1 : 0,
    (input.skip_https_hostname_validation ?? existing.skip_https_hostname_validation) ? 1 : 0,
    (input.enabled ?? existing.enabled) ? 1 : 0,
    now,
    id
  );

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "proxy_host",
    entityId: id,
    summary: `Updated proxy host ${input.name ?? existing.name}`,
    data: input
  });

  await applyCaddyConfig();
  return getProxyHost(id)!;
}

export async function deleteProxyHost(id: number, actorUserId: number) {
  const existing = getProxyHost(id);
  if (!existing) {
    throw new Error("Proxy host not found");
  }

  db.prepare("DELETE FROM proxy_hosts WHERE id = ?").run(id);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "proxy_host",
    entityId: id,
    summary: `Deleted proxy host ${existing.name}`
  });
  await applyCaddyConfig();
}
