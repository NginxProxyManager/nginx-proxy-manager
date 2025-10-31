import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { runMigrations } from "./migrations";

const defaultDbPath = join(process.cwd(), "data", "caddy-proxy-manager.db");
const dbPath = process.env.DATABASE_PATH || defaultDbPath;

mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

runMigrations(db);

export default db;

export function nowIso(): string {
  return new Date().toISOString();
}
