import prisma, { nowIso } from "../db";
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

function parseDbRecord(record: {
  id: number;
  name: string;
  domains: string;
  destination: string;
  statusCode: number;
  preserveQuery: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): RedirectHost {
  return {
    id: record.id,
    name: record.name,
    domains: JSON.parse(record.domains),
    destination: record.destination,
    status_code: record.statusCode,
    preserve_query: record.preserveQuery,
    enabled: record.enabled,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString()
  };
}

export async function listRedirectHosts(): Promise<RedirectHost[]> {
  const records = await prisma.redirectHost.findMany({
    orderBy: { createdAt: "desc" }
  });
  return records.map(parseDbRecord);
}

export async function getRedirectHost(id: number): Promise<RedirectHost | null> {
  const record = await prisma.redirectHost.findUnique({
    where: { id }
  });
  return record ? parseDbRecord(record) : null;
}

export async function createRedirectHost(input: RedirectHostInput, actorUserId: number) {
  if (!input.domains || input.domains.length === 0) {
    throw new Error("At least one domain is required");
  }

  const now = new Date(nowIso());
  const record = await prisma.redirectHost.create({
    data: {
      name: input.name.trim(),
      domains: JSON.stringify(Array.from(new Set(input.domains.map((d) => d.trim().toLowerCase())))),
      destination: input.destination.trim(),
      statusCode: input.status_code ?? 302,
      preserveQuery: input.preserve_query ?? true,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUserId
    }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "redirect_host",
    entityId: record.id,
    summary: `Created redirect ${input.name}`
  });
  await applyCaddyConfig();
  return (await getRedirectHost(record.id))!;
}

export async function updateRedirectHost(id: number, input: Partial<RedirectHostInput>, actorUserId: number) {
  const existing = await getRedirectHost(id);
  if (!existing) {
    throw new Error("Redirect host not found");
  }

  const now = new Date(nowIso());
  await prisma.redirectHost.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      domains: input.domains ? JSON.stringify(Array.from(new Set(input.domains))) : JSON.stringify(existing.domains),
      destination: input.destination ?? existing.destination,
      statusCode: input.status_code ?? existing.status_code,
      preserveQuery: input.preserve_query ?? existing.preserve_query,
      enabled: input.enabled ?? existing.enabled,
      updatedAt: now
    }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "redirect_host",
    entityId: id,
    summary: `Updated redirect ${input.name ?? existing.name}`
  });
  await applyCaddyConfig();
  return (await getRedirectHost(id))!;
}

export async function deleteRedirectHost(id: number, actorUserId: number) {
  const existing = await getRedirectHost(id);
  if (!existing) {
    throw new Error("Redirect host not found");
  }

  await prisma.redirectHost.delete({
    where: { id }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "redirect_host",
    entityId: id,
    summary: `Deleted redirect ${existing.name}`
  });
  await applyCaddyConfig();
}
