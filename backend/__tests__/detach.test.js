import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * detachProviderUsers talks to three tables. Rather than stand up a database,
 * these fakes model just enough of the query builder to exercise the decisions,
 * which is where the risk actually is: who gets deleted and who is spared.
 */
const db = { auths: [], users: [] };

const makeQuery = (rows, onPatch) => {
	const state = { filters: [], negations: [] };

	const builder = {
		where(field, opOrValue, maybeValue) {
			if (typeof field === "object") {
				for (const [k, v] of Object.entries(field)) {
					state.filters.push([k, v]);
				}
				return builder;
			}
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
			const rows = builder.matches();
			for (const row of rows) {
				onPatch(row, changes);
			}
			return Promise.resolve(rows.length);
		},
		// biome-ignore lint/suspicious/noThenProperty: objection query builders are thenables, so the fake must be awaitable the same way
		then(resolve, reject) {
			return Promise.resolve(builder.matches()).then(resolve, reject);
		},
	};
	return builder;
};

const applyPatch = (row, changes) => {
	for (const [k, v] of Object.entries(changes)) {
		row[k] = typeof v === "number" && (k === "is_deleted" || k === "is_disabled") ? !!v : v;
	}
};

vi.mock("../models/auth.js", () => ({
	default: { query: () => makeQuery(() => db.auths, applyPatch) },
}));
vi.mock("../models/user.js", () => ({
	default: { query: () => makeQuery(() => db.users, applyPatch) },
}));
vi.mock("../models/user_permission.js", () => ({ default: {} }));

const { detachProviderUsers } = await import("../lib/auth/provision.js");

const provider = { id: 1, name: "Company LDAP" };

beforeEach(() => {
	db.auths = [];
	db.users = [];
});

const addUser = (id, email, roles = [], opts = {}) => {
	db.users.push({ id, email, roles, is_deleted: false, is_disabled: false, ...opts });
};
const addLink = (id, userId, providerId, type = "ldap") => {
	db.auths.push({ id, user_id: userId, provider_id: providerId, type, is_deleted: false });
};

describe("detachProviderUsers, converting", () => {
	it("keeps the accounts and drops only the link", async () => {
		addUser(1, "alice@example.com");
		addLink(10, 1, 1);

		const result = await detachProviderUsers(provider, "convert");

		expect(result).toMatchObject({ converted: 1, deleted: 0 });
		expect(db.users[0].is_deleted).toBe(false);
		expect(db.auths[0].is_deleted).toBe(true);
	});

	it("is the default, so omitting the action never deletes anyone", async () => {
		addUser(1, "alice@example.com");
		addLink(10, 1, 1);

		await detachProviderUsers(provider);

		expect(db.users[0].is_deleted).toBe(false);
	});

	it("leaves other providers' links alone", async () => {
		addUser(1, "alice@example.com");
		addLink(10, 1, 1);
		addLink(11, 1, 2);

		await detachProviderUsers(provider, "convert");

		expect(db.auths.find((a) => a.id === 10).is_deleted).toBe(true);
		expect(db.auths.find((a) => a.id === 11).is_deleted).toBe(false);
	});
});

describe("detachProviderUsers, deleting", () => {
	it("removes an account that has no other way in", async () => {
		addUser(1, "alice@example.com");
		addUser(2, "admin@example.com", ["admin"]);
		addLink(10, 1, 1);

		const result = await detachProviderUsers(provider, "delete");

		expect(result).toMatchObject({ deleted: 1, converted: 0 });
		expect(db.users.find((u) => u.id === 1).is_deleted).toBe(true);
	});

	it("keeps somebody who also has a password", async () => {
		addUser(1, "alice@example.com");
		addLink(10, 1, 1);
		addLink(11, 1, 0, "password");

		const result = await detachProviderUsers(provider, "delete");

		expect(result.deleted).toBe(0);
		expect(result.converted).toBe(1);
		expect(result.kept[0]).toMatchObject({ email: "alice@example.com" });
		expect(db.users[0].is_deleted).toBe(false);
	});

	it("keeps somebody who also signs in through another provider", async () => {
		addUser(1, "alice@example.com");
		addLink(10, 1, 1);
		addLink(11, 1, 2);

		const result = await detachProviderUsers(provider, "delete");

		expect(result.deleted).toBe(0);
		expect(db.users[0].is_deleted).toBe(false);
	});

	it("never removes the last remaining administrator", async () => {
		addUser(1, "admin@example.com", ["admin"]);
		addLink(10, 1, 1);

		const result = await detachProviderUsers(provider, "delete");

		expect(result.deleted).toBe(0);
		expect(result.kept[0].reason).toMatch(/only administrator/);
		expect(db.users[0].is_deleted).toBe(false);
	});

	it("removes one of two administrators but stops at the last", async () => {
		addUser(1, "admin-a@example.com", ["admin"]);
		addUser(2, "admin-b@example.com", ["admin"]);
		addLink(10, 1, 1);
		addLink(11, 2, 1);

		const result = await detachProviderUsers(provider, "delete");

		expect(result.deleted).toBe(1);
		expect(result.kept).toHaveLength(1);
		// Whichever survived, exactly one administrator is still standing
		const remaining = db.users.filter((u) => !u.is_deleted && u.roles.includes("admin"));
		expect(remaining).toHaveLength(1);
	});

	it("ignores an account that was already deleted", async () => {
		addUser(1, "gone@example.com", [], { is_deleted: true });
		addLink(10, 1, 1);

		const result = await detachProviderUsers(provider, "delete");

		expect(result).toMatchObject({ converted: 0, deleted: 0 });
	});

	it("does nothing at all when the provider owns no accounts", async () => {
		addUser(1, "local@example.com");
		addLink(10, 1, 0, "password");

		const result = await detachProviderUsers(provider, "delete");

		expect(result).toMatchObject({ converted: 0, deleted: 0 });
		expect(db.auths[0].is_deleted).toBe(false);
	});
});
