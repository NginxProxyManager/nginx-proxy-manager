import NextAuth, { type DefaultSession } from "next-auth";
import Authentik from "next-auth/providers/authentik";
import { CustomAdapter } from "./auth/adapter";
import { getOAuthSettings } from "./settings";
import { config } from "./config";
import type { SessionContext, UserRecord } from "./auth/session";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

// Legacy compatibility types
export type { SessionContext, UserRecord };

/**
 * Creates the appropriate OAuth provider based on settings.
 */
function createOAuthProvider() {
  const settings = getOAuthSettings();
  if (!settings) {
    return null;
  }

  // Use official Authentik provider for OIDC
  if (settings.providerType === "authentik") {
    // Extract issuer from authorization URL
    // Authentik format: https://domain/application/o/APP_SLUG/authorization/authorize/
    // Issuer should be: https://domain/application/o/APP_SLUG/
    let issuer: string;
    try {
      const url = new URL(settings.authorizationUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const oIndex = pathParts.indexOf('o');

      if (oIndex >= 0 && pathParts[oIndex + 2] === 'authorization') {
        const slug = pathParts[oIndex + 1];
        issuer = `${url.origin}/application/o/${slug}/`;
      } else {
        // Fallback: remove the authorization path
        issuer = settings.authorizationUrl.replace(/\/authorization\/authorize\/?$/, '/');
      }

      console.log('[Auth.js] Derived Authentik issuer:', issuer);
      console.log('[Auth.js] Will attempt OIDC discovery at:', `${issuer}.well-known/openid-configuration`);
    } catch (e) {
      console.error("Failed to parse Authentik issuer from URL", e);
      return null;
    }

    return Authentik({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      issuer,
      authorization: {
        params: {
          scope: settings.scopes || "openid email profile",
        },
      },
    });
  }

  // Generic OAuth2 provider for non-OIDC providers
  return {
    id: "oauth",
    name: "OAuth2",
    type: "oauth" as const,
    authorization: {
      url: settings.authorizationUrl,
      params: {
        scope: settings.scopes || "openid email profile",
      },
    },
    token: {
      url: settings.tokenUrl,
    },
    userinfo: {
      url: settings.userInfoUrl,
    },
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    checks: ["state", "pkce"] as const,
    profile(profile: any) {
      const emailClaim = settings.emailClaim || "email";
      const nameClaim = settings.nameClaim || "name";
      const avatarClaim = settings.avatarClaim || "picture";

      return {
        id: String(profile.sub || profile.id || profile.user_id || profile[emailClaim]),
        email: String(profile[emailClaim]),
        name: profile[nameClaim] ? String(profile[nameClaim]) : null,
        image: profile[avatarClaim] ? String(profile[avatarClaim]) : null,
      };
    },
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: CustomAdapter(),
  providers: [createOAuthProvider()].filter(Boolean),
  session: {
    strategy: "database",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Fetch role from database
        const db = (await import("./db")).default;
        const dbUser = db.prepare("SELECT role FROM users WHERE id = ?").get(user.id) as { role: string } | undefined;
        session.user.role = dbUser?.role || "user";
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Auto-assign admin role to first user
      const db = (await import("./db")).default;
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };

      if (userCount.count === 1) {
        // This is the first user, make them admin
        db.prepare("UPDATE users SET role = ? WHERE id = ?").run("admin", user.id);
      }

      return true;
    },
    async redirect({ url, baseUrl }) {
      // Validate redirect URL to prevent open redirect attacks
      if (url.startsWith("/")) {
        // Reject URLs starting with // (protocol-relative URLs)
        if (url.startsWith("//")) {
          return baseUrl;
        }
        // Check for encoded slashes
        if (url.includes('%2f%2f') || url.toLowerCase().includes('%2f%2f')) {
          return baseUrl;
        }
        // Reject protocol specifications in the path
        if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
          return baseUrl;
        }
        return url;
      }

      // Only allow redirects to same origin
      if (url.startsWith(baseUrl)) {
        return url;
      }

      return baseUrl;
    },
  },
  secret: config.sessionSecret,
  trustHost: true,
  basePath: "/api/auth",
});

/**
 * Helper function to get the current session on the server.
 * Returns user and session data in the legacy format for compatibility.
 */
export async function getSessionLegacy(): Promise<SessionContext | null> {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const db = (await import("./db")).default;
  const user = db.prepare(
    `SELECT id, email, name, role, provider, subject, avatar_url, status, created_at, updated_at
     FROM users WHERE id = ?`
  ).get(session.user.id) as UserRecord | undefined;

  if (!user) {
    return null;
  }

  return {
    session: {
      id: 0, // Auth.js doesn't expose session ID
      user_id: Number(session.user.id),
      token: "", // Not exposed by Auth.js
      expires_at: session.expires || "",
      created_at: ""
    },
    user
  };
}

/**
 * Helper function to require authentication, throwing if not authenticated.
 * Returns user and session data in the legacy format for compatibility.
 */
export async function requireUser(): Promise<SessionContext> {
  const context = await getSessionLegacy();
  if (!context) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
    // TypeScript doesn't know redirect() never returns, so we throw to help the type checker
    throw new Error("Redirecting to login");
  }
  return context;
}
