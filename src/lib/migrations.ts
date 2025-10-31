import Database from "better-sqlite3";

type Migration = {
  id: number;
  description: string;
  up: (db: Database.Database) => void;
};

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    description: "initial schema",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          provider TEXT NOT NULL,
          subject TEXT NOT NULL,
          avatar_url TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

        CREATE TABLE IF NOT EXISTS oauth_states (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          state TEXT NOT NULL UNIQUE,
          code_verifier TEXT NOT NULL,
          redirect_to TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS access_lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS access_list_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          access_list_id INTEGER NOT NULL,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (access_list_id) REFERENCES access_lists(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_access_list_entries_access_list_id
          ON access_list_entries(access_list_id);

        CREATE TABLE IF NOT EXISTS certificates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          domain_names TEXT NOT NULL,
          auto_renew INTEGER NOT NULL DEFAULT 1,
          provider_options TEXT,
          certificate_pem TEXT,
          private_key_pem TEXT,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS proxy_hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          domains TEXT NOT NULL,
          upstreams TEXT NOT NULL,
          certificate_id INTEGER,
          access_list_id INTEGER,
          owner_user_id INTEGER,
          ssl_forced INTEGER NOT NULL DEFAULT 1,
          hsts_enabled INTEGER NOT NULL DEFAULT 1,
          hsts_subdomains INTEGER NOT NULL DEFAULT 0,
          allow_websocket INTEGER NOT NULL DEFAULT 1,
          preserve_host_header INTEGER NOT NULL DEFAULT 1,
          meta TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE SET NULL,
          FOREIGN KEY (access_list_id) REFERENCES access_lists(id) ON DELETE SET NULL,
          FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS redirect_hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          domains TEXT NOT NULL,
          destination TEXT NOT NULL,
          status_code INTEGER NOT NULL DEFAULT 302,
          preserve_query INTEGER NOT NULL DEFAULT 1,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS dead_hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          domains TEXT NOT NULL,
          status_code INTEGER NOT NULL DEFAULT 503,
          response_body TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS stream_hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          listen_port INTEGER NOT NULL,
          protocol TEXT NOT NULL,
          upstream TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS api_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          created_by INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT,
          expires_at TEXT,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);

        CREATE TABLE IF NOT EXISTS audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id INTEGER,
          summary TEXT,
          data TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
      `);
    }
  }
];

export function runMigrations(db: Database.Database) {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY);");

  const appliedStmt = db.prepare("SELECT id FROM schema_migrations");
  const applied = new Set<number>(appliedStmt.all().map((row: { id: number }) => row.id));

  const insertStmt = db.prepare("INSERT INTO schema_migrations (id) VALUES (?)");

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }
    db.transaction(() => {
      migration.up(db);
      insertStmt.run(migration.id);
    })();
  }
}
