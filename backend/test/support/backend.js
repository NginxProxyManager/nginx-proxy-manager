// Loads the real internal/* modules against an in-memory SQLite database with all migrations applied.
// Tests stub what would touch nginx, certbot or the audit log on the returned module objects.
import { register } from "node:module";

const lib = new URL("../../lib/", import.meta.url);

register("./config-hooks.js", import.meta.url, {
	data: {
		real: new URL("config.js", lib).href,
		fake: new URL("./fake-config.js", import.meta.url).href,
	},
});

const load = async (path) => (await import(new URL(`../../${path}`, import.meta.url).href)).default;

const db = (await load("db.js"))();
await db.migrate.latest({
	directory: new URL("../../migrations", import.meta.url).pathname,
	loadExtensions: [".js"],
});

const ts = { created_on: "2026-01-01 00:00:00", modified_on: "2026-01-01 00:00:00" };
await db("user").insert({
	id: 1,
	name: "Admin",
	nickname: "admin",
	email: "admin@example.com",
	avatar: "",
	roles: "[]",
	...ts,
});

/** An access object that may do everything, as for an admin */
const access = {
	can: async () => ({ permission_visibility: "all" }),
	hasRole: (role) => role === "admin",
	getPermissions: () => ({ visibility: "all" }),
	token: { getUserId: () => 1, hasScope: (scope) => scope === "admin" },
};

/**
 * An access object for a user who isn't an admin
 *
 * @param   {Object}  [opts]
 * @param   {Number}  [opts.userId]
 * @param   {String}  [opts.visibility]  "all" or "user" ('Created Items Only')
 * @param   {Object}  [opts.meta]        permissions.meta, eg. { proxy_host_ids: [1] }
 * @returns {Object}
 */
const userAccess = ({ userId = 1, visibility = "all", meta = null } = {}) => ({
	can: async () => ({ permission_visibility: visibility }),
	hasRole: () => false,
	getPermissions: () => ({ visibility, meta }),
	token: { getUserId: () => userId, hasScope: () => false },
});

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

export { access, db, load, tick, ts, userAccess };
