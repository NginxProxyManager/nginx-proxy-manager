import db, { nowIso } from "../db";

export type User = {
  id: number;
  email: string;
  name: string | null;
  role: "admin" | "user" | "viewer";
  provider: string;
  subject: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function getUserById(userId: number): User | null {
  const row = db
    .prepare(
      `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
       FROM users WHERE id = ?`
    )
    .get(userId) as User | undefined;
  return row ?? null;
}

export function getUserCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return Number(row.count);
}

export function findUserByProviderSubject(provider: string, subject: string): User | null {
  const row = db
    .prepare(
      `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
       FROM users WHERE provider = ? AND subject = ?`
    )
    .get(provider, subject) as User | undefined;
  return row ?? null;
}

export function findUserByEmail(email: string): User | null {
  const row = db
    .prepare(
      `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
       FROM users WHERE email = ?`
    )
    .get(email) as User | undefined;
  return row ?? null;
}

export function createUser(data: {
  email: string;
  name?: string | null;
  role?: User["role"];
  provider: string;
  subject: string;
  avatar_url?: string | null;
}): User {
  const now = nowIso();
  const role = data.role ?? "user";
  const stmt = db.prepare(
    `INSERT INTO users (email, name, role, provider, subject, avatar_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  );
  const info = stmt.run(data.email, data.name ?? null, role, data.provider, data.subject, data.avatar_url ?? null, now, now);

  return {
    id: Number(info.lastInsertRowid),
    email: data.email,
    name: data.name ?? null,
    role,
    provider: data.provider,
    subject: data.subject,
    avatar_url: data.avatar_url ?? null,
    status: "active",
    created_at: now,
    updated_at: now
  };
}

export function updateUserProfile(userId: number, data: { email?: string; name?: string | null; avatar_url?: string | null }): User | null {
  const current = getUserById(userId);
  if (!current) {
    return null;
  }
  const nextEmail = data.email ?? current.email;
  const nextName = data.name ?? current.name;
  const nextAvatar = data.avatar_url ?? current.avatar_url;
  const now = nowIso();
  db.prepare(
    `UPDATE users
     SET email = ?, name = ?, avatar_url = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextEmail, nextName, nextAvatar, now, userId);

  return {
    ...current,
    email: nextEmail,
    name: nextName,
    avatar_url: nextAvatar,
    updated_at: now
  };
}

export function listUsers(): User[] {
  const rows = db
    .prepare(
      `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
       FROM users
       ORDER BY created_at ASC`
    )
    .all() as User[];
  return rows;
}

export function promoteToAdmin(userId: number) {
  const now = nowIso();
  db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(now, userId);
}
