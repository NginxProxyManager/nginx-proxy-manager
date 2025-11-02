import prisma, { nowIso } from "./db";
import { config } from "./config";

/**
 * Ensures the admin user from environment variables exists in the database.
 * This is called during application startup.
 */
export async function ensureAdminUser(): Promise<void> {
  const adminId = 1; // Must match the hardcoded ID in auth.ts
  const adminEmail = `${config.adminUsername}@localhost`;
  const provider = "credentials";
  const subject = config.adminUsername;

  // Check if admin user already exists
  const existingUser = await prisma.user.findUnique({
    where: { id: adminId }
  });

  if (existingUser) {
    // Admin user exists, update if needed
    if (existingUser.email !== adminEmail || existingUser.subject !== subject) {
      const now = new Date(nowIso());
      await prisma.user.update({
        where: { id: adminId },
        data: {
          email: adminEmail,
          subject,
          updatedAt: now
        }
      });
      console.log(`Updated admin user: ${config.adminUsername}`);
    }
    return;
  }

  // Create admin user
  const now = new Date(nowIso());
  await prisma.user.create({
    data: {
      id: adminId,
      email: adminEmail,
      name: config.adminUsername,
      passwordHash: null, // Using environment variable auth, not password hash
      role: "admin",
      provider,
      subject,
      avatarUrl: null,
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  });

  console.log(`Created admin user: ${config.adminUsername}`);
}
