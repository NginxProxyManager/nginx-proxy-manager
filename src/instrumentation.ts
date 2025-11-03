/**
 * Next.js instrumentation hook - runs once when the server starts
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate production configuration early to catch misconfigurations
    const { validateProductionConfig } = await import("./lib/config");
    try {
      validateProductionConfig();
    } catch (error) {
      console.error("Configuration validation failed:", error);
      if (process.env.NODE_ENV === "production") {
        // Fail fast in production with bad config
        throw error;
      }
    }

    const { ensureAdminUser } = await import("./lib/init-db");
    try {
      await ensureAdminUser();
      console.log("Database initialization complete");
    } catch (error) {
      console.error("Failed to initialize database:", error);
      // Don't throw - let the app start anyway, errors will surface when users try to use features
    }
  }
}
