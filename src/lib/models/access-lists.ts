import bcrypt from "bcryptjs";
import prisma, { nowIso } from "../db";
import { logAuditEvent } from "../audit";
import { applyCaddyConfig } from "../caddy";

export type AccessListEntry = {
  id: number;
  username: string;
  created_at: string;
  updated_at: string;
};

export type AccessList = {
  id: number;
  name: string;
  description: string | null;
  entries: AccessListEntry[];
  created_at: string;
  updated_at: string;
};

export type AccessListInput = {
  name: string;
  description?: string | null;
  users?: { username: string; password: string }[];
};

function toAccessList(
  row: {
    id: number;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  entries: {
    id: number;
    username: string;
    createdAt: Date;
    updatedAt: Date;
  }[]
): AccessList {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    entries: entries.map((entry) => ({
      id: entry.id,
      username: entry.username,
      created_at: entry.createdAt.toISOString(),
      updated_at: entry.updatedAt.toISOString()
    })),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export async function listAccessLists(): Promise<AccessList[]> {
  const lists = await prisma.accessList.findMany({
    orderBy: { name: "asc" },
    include: {
      entries: {
        select: {
          id: true,
          username: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { username: "asc" }
      }
    }
  });
  return lists.map((list: typeof lists[0]) => toAccessList(list, list.entries));
}

export async function getAccessList(id: number): Promise<AccessList | null> {
  const list = await prisma.accessList.findUnique({
    where: { id },
    include: {
      entries: {
        select: {
          id: true,
          username: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { username: "asc" }
      }
    }
  });
  return list ? toAccessList(list, list.entries) : null;
}

export async function createAccessList(input: AccessListInput, actorUserId: number) {
  const now = new Date(nowIso());

  const accessList = await prisma.accessList.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      createdBy: actorUserId,
      createdAt: now,
      updatedAt: now,
      entries: input.users
        ? {
            create: input.users.map((account) => ({
              username: account.username,
              passwordHash: bcrypt.hashSync(account.password, 10),
              createdAt: now,
              updatedAt: now
            }))
          }
        : undefined
    }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "access_list",
    entityId: accessList.id,
    summary: `Created access list ${input.name}`
  });

  await applyCaddyConfig();
  return (await getAccessList(accessList.id))!;
}

export async function updateAccessList(
  id: number,
  input: { name?: string; description?: string | null },
  actorUserId: number
) {
  const existing = await getAccessList(id);
  if (!existing) {
    throw new Error("Access list not found");
  }

  const now = new Date(nowIso());
  await prisma.accessList.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      updatedAt: now
    }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "access_list",
    entityId: id,
    summary: `Updated access list ${input.name ?? existing.name}`
  });

  await applyCaddyConfig();
  return (await getAccessList(id))!;
}

export async function addAccessListEntry(
  accessListId: number,
  entry: { username: string; password: string },
  actorUserId: number
) {
  const list = await prisma.accessList.findUnique({
    where: { id: accessListId }
  });
  if (!list) {
    throw new Error("Access list not found");
  }
  const now = new Date(nowIso());
  const hash = bcrypt.hashSync(entry.password, 10);
  await prisma.accessListEntry.create({
    data: {
      accessListId,
      username: entry.username,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now
    }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "access_list_entry",
    entityId: accessListId,
    summary: `Added user ${entry.username} to access list ${list.name}`
  });
  await applyCaddyConfig();
  return (await getAccessList(accessListId))!;
}

export async function removeAccessListEntry(accessListId: number, entryId: number, actorUserId: number) {
  const list = await prisma.accessList.findUnique({
    where: { id: accessListId }
  });
  if (!list) {
    throw new Error("Access list not found");
  }
  await prisma.accessListEntry.delete({
    where: { id: entryId }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "access_list_entry",
    entityId: entryId,
    summary: `Removed entry from access list ${list.name}`
  });
  await applyCaddyConfig();
  return (await getAccessList(accessListId))!;
}

export async function deleteAccessList(id: number, actorUserId: number) {
  const existing = await prisma.accessList.findUnique({
    where: { id }
  });
  if (!existing) {
    throw new Error("Access list not found");
  }
  await prisma.accessList.delete({
    where: { id }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "access_list",
    entityId: id,
    summary: `Deleted access list ${existing.name}`
  });
  await applyCaddyConfig();
}
