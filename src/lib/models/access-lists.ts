import bcrypt from "bcryptjs";
import db, { nowIso } from "../db";
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

function parseAccessList(row: any): AccessList {
  const entries = db
    .prepare(
      `SELECT id, username, created_at, updated_at
       FROM access_list_entries
       WHERE access_list_id = ?
       ORDER BY username ASC`
    )
    .all(row.id) as AccessListEntry[];

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    entries,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listAccessLists(): AccessList[] {
  const rows = db
    .prepare(
      `SELECT id, name, description, created_at, updated_at
       FROM access_lists
       ORDER BY name ASC`
    )
    .all();
  return rows.map(parseAccessList);
}

export function getAccessList(id: number): AccessList | null {
  const row = db
    .prepare(
      `SELECT id, name, description, created_at, updated_at
       FROM access_lists WHERE id = ?`
    )
    .get(id);
  if (!row) {
    return null;
  }
  return parseAccessList(row);
}

export async function createAccessList(input: AccessListInput, actorUserId: number) {
  const now = nowIso();
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO access_lists (name, description, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.name.trim(), input.description ?? null, now, now, actorUserId);
    const accessListId = Number(result.lastInsertRowid);

    if (input.users) {
      const insert = db.prepare(
        `INSERT INTO access_list_entries (access_list_id, username, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const account of input.users) {
        const hash = bcrypt.hashSync(account.password, 10);
        insert.run(accessListId, account.username, hash, now, now);
      }
    }

    logAuditEvent({
      userId: actorUserId,
      action: "create",
      entityType: "access_list",
      entityId: accessListId,
      summary: `Created access list ${input.name}`
    });

    return accessListId;
  });

  const id = tx();
  await applyCaddyConfig();
  return getAccessList(id)!;
}

export async function updateAccessList(
  id: number,
  input: { name?: string; description?: string | null },
  actorUserId: number
) {
  const existing = getAccessList(id);
  if (!existing) {
    throw new Error("Access list not found");
  }

  const now = nowIso();
  db.prepare(
    `UPDATE access_lists SET name = ?, description = ?, updated_at = ? WHERE id = ?`
  ).run(input.name ?? existing.name, input.description ?? existing.description, now, id);

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "access_list",
    entityId: id,
    summary: `Updated access list ${input.name ?? existing.name}`
  });

  await applyCaddyConfig();
  return getAccessList(id)!;
}

export async function addAccessListEntry(
  accessListId: number,
  entry: { username: string; password: string },
  actorUserId: number
) {
  const list = getAccessList(accessListId);
  if (!list) {
    throw new Error("Access list not found");
  }
  const now = nowIso();
  const hash = bcrypt.hashSync(entry.password, 10);
  db.prepare(
    `INSERT INTO access_list_entries (access_list_id, username, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(accessListId, entry.username, hash, now, now);
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "access_list_entry",
    entityId: accessListId,
    summary: `Added user ${entry.username} to access list ${list.name}`
  });
  await applyCaddyConfig();
  return getAccessList(accessListId)!;
}

export async function removeAccessListEntry(accessListId: number, entryId: number, actorUserId: number) {
  const list = getAccessList(accessListId);
  if (!list) {
    throw new Error("Access list not found");
  }
  db.prepare("DELETE FROM access_list_entries WHERE id = ?").run(entryId);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "access_list_entry",
    entityId: entryId,
    summary: `Removed entry from access list ${list.name}`
  });
  await applyCaddyConfig();
  return getAccessList(accessListId)!;
}

export async function deleteAccessList(id: number, actorUserId: number) {
  const existing = getAccessList(id);
  if (!existing) {
    throw new Error("Access list not found");
  }
  db.prepare("DELETE FROM access_lists WHERE id = ?").run(id);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "access_list",
    entityId: id,
    summary: `Deleted access list ${existing.name}`
  });
  await applyCaddyConfig();
}
