// Stand-in for lib/config.js in tests, see config-hooks.js
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A file, not ":memory:": some SQLite migrations (column renames) need more than one connection
const filename = join(mkdtempSync(join(tmpdir(), "npm-test-")), "database.sqlite");

const database = {
	engine: "knex-native",
	knex: {
		client: "better-sqlite3",
		connection: { filename },
		useNullAsDefault: true,
	},
};

const configHas = (key) => key === "database" || key.startsWith("database.");
const configGet = (key) => {
	if (key === "database") {
		return database;
	}
	if (key === "database.engine") {
		return database.engine;
	}
	throw new Error(`fake config: ${key} is not available in tests`);
};
const isSqlite = () => true;
const isMysql = () => false;
const isPostgres = () => false;
const isDebugMode = () => false;
const isCI = () => false;
const getPrivateKey = () => {
	throw new Error("fake config: no JWT keys in tests");
};
const getPublicKey = getPrivateKey;
const useLetsencryptStaging = () => false;
const useLetsencryptServer = () => null;

export {
	isCI,
	configHas,
	configGet,
	isSqlite,
	isMysql,
	isPostgres,
	isDebugMode,
	getPrivateKey,
	getPublicKey,
	useLetsencryptStaging,
	useLetsencryptServer,
};
