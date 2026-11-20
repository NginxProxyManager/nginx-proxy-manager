import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What happens to an existing account when the admin group mapping says it is
 * no longer an administrator: the role goes, the "see everything" visibility
 * that came with it goes too, and neither happens to the last administrator.
 */
const db = { auths: [], users: [], permissions: [], localAuthEnabled: true };

const makeQuery = (rows) => {
	const state = { filters: [], negations: [] };

	const builder = {
		where(field, opOrValue, maybeValue) {
			if (maybeValue !== undefined && opOrValue === "!=") {
				state.negations.push([field, maybeValue]);
			} else {
				state.filters.push([field, opOrValue]);
			}
			return builder;
		},
		andWhere(...args) {
			return builder.where(...args);
		},
		matches() {
			return rows().filter(
				(r) =>
					state.filters.every(([k, v]) => (typeof r[k] === "boolean" ? r[k] === !!v : r[k] === v)) &&
					state.negations.every(([k, v]) => r[k] !== v),
			);
		},
		first() {
			return Promise.resolve(builder.matches()[0]);
		},
		patch(changes) {
			const matched = builder.matches();
			for (const row of matched) {
				Object.assign(row, changes);
			}
			return Promise.resolve(matched.length);
		},
		insert(row) {
			rows().push(row);
			return Promise.resolve(row);
		},
		// biome-ignore lint/suspicious/noThenProperty: objection query builders are thenables, so the fake must be awaitable the same way
		then(resolve, reject) {
			return Promise.resolve(builder.matches()).then(resolve, reject);
		},
	};
	return builder;
};

vi.mock("../models/auth.js", () => ({ default: { query: () => makeQuery(() => db.auths) } }));
vi.mock("../models/user.js", () => ({ default: { query: () => makeQuery(() => db.users) } }));
vi.mock("../models/user_permission.js", () => ({ default: { query: () => makeQuery(() => db.permissions) } }));
vi.mock("../lib/auth/local-auth.js", () => ({
	isLocalAuthEnabled: async () => db.localAuthEnabled,
	LOCAL_AUTH_SETTING: "auth-local",
	localAuthDisabledByEnv: () => null,
}));

const { resolveUser } = await import("../lib/auth/provision.js");

const provider = {
	id: 1,
	name: "Company LDAP",
	slug: "company-ldap",
	type: "ldap",
	meta: { admin_group: "npm-admins" },
};

beforeEach(() => {
	db.auths = [];
	db.users = [];
	db.permissions = [];
	db.localAuthEnabled = true;
});

const addUser = (id, roles, visibility) => {
	db.users.push({ id, email: `user${id}@example.com`, roles, is_deleted: false, is_disabled: false });
	db.permissions.push({ user_id: id, visibility });
};
const addLink = (userId, providerId, type = "ldap") => {
	db.auths.push({
		id: 100 + db.auths.length,
		user_id: userId,
		provider_id: providerId,
		identifier: `guid-${userId}`,
		type,
		is_deleted: false,
	});
};

const signIn = (id, groups) =>
	resolveUser(provider, { identifier: `guid-${id}`, email: `user${id}@example.com`, groups });

const user = (id) => db.users.find((u) => u.id === id);
const visibility = (id) => db.permissions.find((p) => p.user_id === id).visibility;

describe("leaving the admin group", () => {
	it("removes admin and resets visibility, so no access to other users' hosts remains", async () => {
		addUser(1, ["admin"], "all");
		addLink(1, 1);
		addUser(2, ["admin"], "all");
		addLink(2, null, "password");

		await signIn(1, ["staff"]);

		expect(user(1).roles).toEqual([]);
		expect(visibility(1)).toBe("user");
	});

	it("keeps the last administrator who could still sign in", async () => {
		addUser(1, ["admin"], "all");
		addLink(1, 1);

		await signIn(1, ["staff"]);

		expect(user(1).roles).toEqual(["admin"]);
		expect(visibility(1)).toBe("all");
	});

	it("does not count an administrator who only has a password once local sign in is off", async () => {
		db.localAuthEnabled = false;
		addUser(1, ["admin"], "all");
		addLink(1, 1);
		addUser(2, ["admin"], "all");
		addLink(2, null, "password");

		await signIn(1, ["staff"]);

		expect(user(1).roles).toEqual(["admin"]);
	});
});

describe("joining the admin group", () => {
	it("grants admin and visibility of everything", async () => {
		addUser(1, [], "user");
		addLink(1, 1);

		await signIn(1, ["npm-admins"]);

		expect(user(1).roles).toEqual(["admin"]);
		expect(visibility(1)).toBe("all");
	});
});

describe("a non-administrator who stays one", () => {
	it("keeps visibility an administrator granted by hand", async () => {
		addUser(1, [], "all");
		addLink(1, 1);

		await signIn(1, ["staff"]);

		expect(visibility(1)).toBe("all");
	});
});
