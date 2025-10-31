import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "next-auth/adapters";
import db, { nowIso } from "../db";
import crypto from "node:crypto";

/**
 * Custom Auth.js adapter for our existing SQLite database schema.
 * Maps our existing users/sessions tables to Auth.js expectations.
 */
export function CustomAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">): Promise<AdapterUser> {
      const stmt = db.prepare(
        `INSERT INTO users (email, name, avatar_url, provider, subject, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      // For Auth.js, we'll use 'oidc' as provider and email as subject initially
      const subject = crypto.randomBytes(16).toString("hex");
      const info = stmt.run(
        user.email,
        user.name || null,
        user.image || null,
        "oidc",
        subject,
        "user",
        "active",
        nowIso(),
        nowIso()
      );

      return {
        id: String(info.lastInsertRowid),
        email: user.email,
        emailVerified: user.emailVerified || null,
        name: user.name || null,
        image: user.image || null
      };
    },

    async getUser(id: string): Promise<AdapterUser | null> {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
      if (!user) return null;

      return {
        id: String(user.id),
        email: user.email,
        emailVerified: null,
        name: user.name,
        image: user.avatar_url
      };
    },

    async getUserByEmail(email: string): Promise<AdapterUser | null> {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) return null;

      return {
        id: String(user.id),
        email: user.email,
        emailVerified: null,
        name: user.name,
        image: user.avatar_url
      };
    },

    async getUserByAccount({ providerAccountId, provider }): Promise<AdapterUser | null> {
      // For Authentik OIDC, match by subject (sub claim)
      const user = db.prepare(
        "SELECT * FROM users WHERE subject = ?"
      ).get(providerAccountId) as any;

      if (!user) return null;

      return {
        id: String(user.id),
        email: user.email,
        emailVerified: null,
        name: user.name,
        image: user.avatar_url
      };
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">): Promise<AdapterUser> {
      const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as any;

      db.prepare(
        `UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        user.email || existing.email,
        user.name || existing.name,
        user.image || existing.avatar_url,
        nowIso(),
        user.id
      );

      return {
        id: user.id,
        email: user.email || existing.email,
        emailVerified: user.emailVerified || null,
        name: user.name || existing.name,
        image: user.image || existing.avatar_url
      };
    },

    async deleteUser(userId: string): Promise<void> {
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    },

    async linkAccount(account: AdapterAccount): Promise<AdapterAccount | null | undefined> {
      // Update the user's subject to the OIDC sub claim
      db.prepare(
        `UPDATE users SET subject = ?, updated_at = ?
         WHERE id = ?`
      ).run(account.providerAccountId, nowIso(), account.userId);

      return account;
    },

    async unlinkAccount({ providerAccountId, provider }): Promise<void> {
      // Set subject back to random
      db.prepare(
        `UPDATE users SET subject = ?, updated_at = ?
         WHERE subject = ?`
      ).run(crypto.randomBytes(16).toString("hex"), nowIso(), providerAccountId);
    },

    async createSession({ sessionToken, userId, expires }): Promise<AdapterSession> {
      const expiresAt = expires.toISOString();

      db.prepare(
        `INSERT INTO sessions (user_id, token, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(userId, sessionToken, expiresAt, nowIso());

      return {
        sessionToken,
        userId,
        expires
      };
    },

    async getSessionAndUser(sessionToken: string): Promise<{ session: AdapterSession; user: AdapterUser } | null> {
      const result = db.prepare(
        `SELECT s.token, s.user_id, s.expires_at, u.id, u.email, u.name, u.avatar_url
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ?`
      ).get(sessionToken) as any;

      if (!result) return null;

      const expires = new Date(result.expires_at);
      if (expires.getTime() < Date.now()) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(sessionToken);
        return null;
      }

      return {
        session: {
          sessionToken: result.token,
          userId: String(result.user_id),
          expires
        },
        user: {
          id: String(result.id),
          email: result.email,
          emailVerified: null,
          name: result.name,
          image: result.avatar_url
        }
      };
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">): Promise<AdapterSession | null | undefined> {
      if (session.expires) {
        db.prepare(
          "UPDATE sessions SET expires_at = ? WHERE token = ?"
        ).run(session.expires.toISOString(), session.sessionToken);
      }

      const existing = db.prepare("SELECT * FROM sessions WHERE token = ?").get(session.sessionToken) as any;
      if (!existing) return null;

      return {
        sessionToken: session.sessionToken,
        userId: String(existing.user_id),
        expires: session.expires || new Date(existing.expires_at)
      };
    },

    async deleteSession(sessionToken: string): Promise<void> {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(sessionToken);
    },

    // Verification tokens not currently used, but required by adapter interface
    async createVerificationToken(token: VerificationToken): Promise<VerificationToken | null | undefined> {
      return token;
    },

    async useVerificationToken({ identifier, token }): Promise<VerificationToken | null> {
      return null;
    }
  };
}
