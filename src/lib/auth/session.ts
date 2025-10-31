import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import db, { nowIso } from "../db";
import { config } from "../config";

const SESSION_COOKIE = "cpm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(token).digest("hex");
}

export type SessionRecord = {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
};

export type UserRecord = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  provider: string;
  subject: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SessionContext = {
  session: SessionRecord;
  user: UserRecord;
};

export function createSession(userId: number): SessionRecord {
  const token = crypto.randomBytes(48).toString("base64url");
  const hashed = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const stmt = db.prepare(
    `INSERT INTO sessions (user_id, token, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  );
  const info = stmt.run(userId, hashed, expiresAt, nowIso());

  const session = {
    id: Number(info.lastInsertRowid),
    user_id: userId,
    token: hashed,
    expires_at: expiresAt,
    created_at: nowIso()
  };

  const cookieStore = cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt)
  });

  return session;
}

export function destroySession() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE);
  cookieStore.delete(SESSION_COOKIE);

  if (!token) {
    return;
  }

  const hashed = hashToken(token.value);
  db.prepare("DELETE FROM sessions WHERE token = ?").run(hashed);
}

export function getSession(): SessionContext | null {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const hashed = hashToken(token.value);
  const session = db
    .prepare(
      `SELECT id, user_id, token, expires_at, created_at
       FROM sessions
       WHERE token = ?`
    )
    .get(hashed) as SessionRecord | undefined;

  if (!session) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  const user = db
    .prepare(
      `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
       FROM users WHERE id = ?`
    )
    .get(session.user_id) as UserRecord | undefined;

  if (!user || user.status !== "active") {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return { session, user };
}

export function requireUser(): SessionContext {
  const context = getSession();
  if (!context) {
    redirect("/login");
  }
  return context;
}
