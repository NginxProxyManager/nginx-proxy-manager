import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./db";

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

// Credentials provider that checks against hashed passwords in the database
function createCredentialsProvider() {
  return Credentials({
    id: "credentials",
    name: "Credentials",
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      const username = credentials?.username ? String(credentials.username).trim() : "";
      const password = credentials?.password ? String(credentials.password) : "";

      if (!username || !password) {
        return null;
      }

      // Look up user in database by email (constructed from username)
      const email = `${username}@localhost`;
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user || user.status !== "active" || !user.passwordHash) {
        return null;
      }

      // Verify password against hashed password in database
      const isValidPassword = bcrypt.compareSync(password, user.passwordHash);
      if (!isValidPassword) {
        return null;
      }

      return {
        id: user.id.toString(),
        name: user.name ?? username,
        email: user.email,
        role: user.role
      };
    }
  });
}

const credentialsProvider = createCredentialsProvider();

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [credentialsProvider],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      // On sign in, add user info to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.role = "admin";
      }
      return token;
    },
    async session({ session, token }) {
      // Add user info from token to session
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  secret: config.sessionSecret,
  trustHost: true,
  basePath: "/api/auth",
});

/**
 * Helper function to get the current session on the server.
 */
export async function getSession() {
  return await auth();
}

/**
 * Helper function to require authentication, throwing if not authenticated.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
    throw new Error("Redirecting to login"); // TypeScript doesn't know redirect() never returns
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== "admin") {
    throw new Error("Administrator privileges required");
  }
  return session;
}
