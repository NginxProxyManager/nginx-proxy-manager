import bcrypt from "bcryptjs";
import prisma, { nowIso } from "./db";
import { config } from "./config";

/**
 * Ensures the admin user from environment variables exists in the database.
 * This is called during application startup.
 * The password from environment variables is hashed and stored securely.
 */
export async function ensureAdminUser(): Promise<void> {
  const adminId = 1; // Must match the hardcoded ID in auth.ts
  const adminEmail = `${config.adminUsername}@localhost`;
  const provider = "credentials";
  const subject = config.adminUsername;

  // Hash the admin password for secure storage
  const passwordHash = bcrypt.hashSync(config.adminPassword, 12);

  // Check if admin user already exists
  const existingUser = await prisma.user.findUnique({
    where: { id: adminId }
  });

  if (existingUser) {
    // Admin user exists, update credentials if needed
    // Always update password hash to handle password changes in env vars
    const now = new Date(nowIso());
    await prisma.user.update({
      where: { id: adminId },
      data: {
        email: adminEmail,
        subject,
        passwordHash,
        updatedAt: now
      }
    });
    console.log(`Updated admin user: ${config.adminUsername}`);
    return;
  }

  // Create admin user with hashed password
  const now = new Date(nowIso());
  await prisma.user.create({
    data: {
      id: adminId,
      email: adminEmail,
      name: config.adminUsername,
      passwordHash, // Store hashed password instead of plaintext
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
