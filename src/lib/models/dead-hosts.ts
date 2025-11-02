import prisma, { nowIso } from "../db";
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

function parse(row: {
  id: number;
  name: string;
  domains: string;
  statusCode: number;
  responseBody: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DeadHost {
  return {
    id: row.id,
    name: row.name,
    domains: JSON.parse(row.domains),
    status_code: row.statusCode,
    response_body: row.responseBody,
    enabled: row.enabled,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export async function listDeadHosts(): Promise<DeadHost[]> {
  const hosts = await prisma.deadHost.findMany({
    orderBy: { createdAt: "desc" }
  });
  return hosts.map(parse);
}

export async function getDeadHost(id: number): Promise<DeadHost | null> {
  const host = await prisma.deadHost.findUnique({
    where: { id }
  });
  return host ? parse(host) : null;
}

export async function createDeadHost(input: DeadHostInput, actorUserId: number) {
  if (!input.domains || input.domains.length === 0) {
    throw new Error("At least one domain is required");
  }

  const now = new Date(nowIso());
  const record = await prisma.deadHost.create({
    data: {
      name: input.name.trim(),
      domains: JSON.stringify(Array.from(new Set(input.domains.map((d) => d.trim().toLowerCase())))),
      statusCode: input.status_code ?? 503,
      responseBody: input.response_body ?? null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUserId
    }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "dead_host",
    entityId: record.id,
    summary: `Created dead host ${input.name}`
  });
  await applyCaddyConfig();
  return (await getDeadHost(record.id))!;
}

export async function updateDeadHost(id: number, input: Partial<DeadHostInput>, actorUserId: number) {
  const existing = await getDeadHost(id);
  if (!existing) {
    throw new Error("Dead host not found");
  }
  const now = new Date(nowIso());
  await prisma.deadHost.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      domains: JSON.stringify(input.domains ? Array.from(new Set(input.domains)) : existing.domains),
      statusCode: input.status_code ?? existing.status_code,
      responseBody: input.response_body ?? existing.response_body,
      enabled: input.enabled ?? existing.enabled,
      updatedAt: now
    }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "dead_host",
    entityId: id,
    summary: `Updated dead host ${input.name ?? existing.name}`
  });
  await applyCaddyConfig();
  return (await getDeadHost(id))!;
}

export async function deleteDeadHost(id: number, actorUserId: number) {
  const existing = await getDeadHost(id);
  if (!existing) {
    throw new Error("Dead host not found");
  }
  await prisma.deadHost.delete({
    where: { id }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "dead_host",
    entityId: id,
    summary: `Deleted dead host ${existing.name}`
  });
  await applyCaddyConfig();
}
