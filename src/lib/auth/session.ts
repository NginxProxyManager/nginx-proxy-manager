import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import db, { nowIso } from "../db";
import { config } from "../config";

const SESSION_COOKIE = "cpm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type CookiesHandle = Awaited<ReturnType<typeof cookies>>;

async function getCookieStore(): Promise<CookiesHandle> {
  return (await cookies()) as CookiesHandle;
}

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

export async function createSession(userId: number): Promise<SessionRecord> {
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

  const cookieStore = await getCookieStore();
  if (typeof cookieStore.set === "function") {
    cookieStore.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt)
    });
  } else {
    console.warn("Unable to set session cookie in this context.");
  }

  return session;
}

export async function destroySession() {
  const cookieStore = await getCookieStore();
  const token = typeof cookieStore.get === "function" ? cookieStore.get(SESSION_COOKIE) : undefined;
  if (typeof cookieStore.delete === "function") {
    cookieStore.delete(SESSION_COOKIE);
  }

  if (!token) {
    return;
  }

  const hashed = hashToken(token.value);
  db.prepare("DELETE FROM sessions WHERE token = ?").run(hashed);
}

export async function getSession(): Promise<SessionContext | null> {
  const cookieStore = await getCookieStore();
  const token = typeof cookieStore.get === "function" ? cookieStore.get(SESSION_COOKIE) : undefined;
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
    return null;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    return null;
  }

  const user = db
    .prepare(
      `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
       FROM users WHERE id = ?`
    )
    .get(session.user_id) as UserRecord | undefined;

  if (!user || user.status !== "active") {
    return null;
  }

  return { session, user };
}

export async function requireUser(): Promise<SessionContext> {
  const context = await getSession();
  if (!context) {
    redirect("/login");
  }
  return context;
}
