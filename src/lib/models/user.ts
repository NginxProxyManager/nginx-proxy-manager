import prisma, { nowIso } from "../db";

export type User = {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  role: "admin" | "user" | "viewer";
  provider: string;
  subject: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function parseDbUser(user: {
  id: number;
  email: string;
  name: string | null;
  passwordHash: string | null;
  role: string;
  provider: string;
  subject: string;
  avatarUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    password_hash: user.passwordHash,
    role: user.role as "admin" | "user" | "viewer",
    provider: user.provider,
    subject: user.subject,
    avatar_url: user.avatarUrl,
    status: user.status,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString()
  };
}

export async function getUserById(userId: number): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  return user ? parseDbUser(user) : null;
}

export async function getUserCount(): Promise<number> {
  return await prisma.user.count();
}

export async function findUserByProviderSubject(provider: string, subject: string): Promise<User | null> {
  const user = await prisma.user.findFirst({
    where: {
      provider,
      subject
    }
  });
  return user ? parseDbUser(user) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      email: normalizedEmail
    }
  });
  return user ? parseDbUser(user) : null;
}

export async function createUser(data: {
  email: string;
  name?: string | null;
  role?: User["role"];
  provider: string;
  subject: string;
  avatar_url?: string | null;
  passwordHash?: string | null;
}): Promise<User> {
  const now = new Date(nowIso());
  const role = data.role ?? "user";
  const email = data.email.trim().toLowerCase();

  const user = await prisma.user.create({
    data: {
      email,
      name: data.name ?? null,
      passwordHash: data.passwordHash ?? null,
      role,
      provider: data.provider,
      subject: data.subject,
      avatarUrl: data.avatar_url ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  });

  return parseDbUser(user);
}

export async function updateUserProfile(userId: number, data: { email?: string; name?: string | null; avatar_url?: string | null }): Promise<User | null> {
  const current = await getUserById(userId);
  if (!current) {
    return null;
  }

  const now = new Date(nowIso());
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      email: data.email ?? current.email,
      name: data.name ?? current.name,
      avatarUrl: data.avatar_url ?? current.avatar_url,
      updatedAt: now
    }
  });

  return parseDbUser(user);
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const now = new Date(nowIso());
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      updatedAt: now
    }
  });
}

export async function listUsers(): Promise<User[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" }
  });
  return users.map(parseDbUser);
}

export async function promoteToAdmin(userId: number): Promise<void> {
  const now = new Date(nowIso());
  await prisma.user.update({
    where: { id: userId },
    data: {
      role: "admin",
      updatedAt: now
    }
  });
}
