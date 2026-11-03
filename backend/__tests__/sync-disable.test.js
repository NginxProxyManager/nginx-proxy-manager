import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * disableMissing decides who loses access when a directory entry goes away.
 * The risk is a partial answer from the directory looking like mass departure,
 * so these fakes model just enough of the query builder to exercise that.
 */
const db = { auths: [], users: [], otherAdminCanSignIn: true, failProvisioning: [] };

const makeQuery = (rows) => {
	const state = { filters: [], notIn: [] };

	const builder = {
		where(field, value) {
			state.filters.push([field, value]);
			return builder;
		},
		andWhere(...args) {
			return builder.where(...args);
		},
		whereNotIn(field, values) {
			state.notIn.push([field, values]);
			return builder;
		},
		matches() {
			return rows().filter(
				(r) =>
					state.filters.every(([k, v]) => (typeof r[k] === "boolean" ? r[k] === !!v : r[k] === v)) &&
					state.notIn.every(([k, v]) => !v.includes(r[k])),
			);
		},
		first() {
			return Promise.resolve(builder.matches()[0]);
		},
		patch(changes) {
			const matched = builder.matches();
			for (const row of matched) {
				for (const [k, v] of Object.entries(changes)) {
					row[k] = k === "is_disabled" || k === "is_deleted" ? !!v : v;
				}
			}
			return Promise.resolve(matched.length);
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
vi.mock("../lib/auth/provision.js", () => ({
	anotherAdminCanSignIn: async () => db.otherAdminCanSignIn,
	resolveUser: async (_, identity) => {
		if (db.failProvisioning.includes(identity.identifier)) {
			throw new Error("SQLITE_BUSY");
		}
	},
}));
vi.mock("../lib/auth/ldap.js", () => ({
	listDirectory: async (_, onEntry) => {
		for (const identity of db.directory) {
			await onEntry(identity);
		}
		return { seen: db.directory.length, skipped: 0 };
	},
}));

const { disableMissing, runSync } = await import("../lib/auth/sync.js");

const provider = (meta = {}) => ({ id: 1, name: "Company LDAP", type: "ldap", meta });

beforeEach(() => {
	db.auths = [];
	db.users = [];
	db.directory = [];
	db.otherAdminCanSignIn = true;
	db.failProvisioning = [];
});

/** Adds a linked account, `guid-<id>` being its directory identifier */
const addLinkedUser = (id, opts = {}) => {
	db.users.push({ id, email: `user${id}@example.com`, roles: [], is_deleted: false, is_disabled: false, ...opts });
	db.auths.push({ id: 100 + id, user_id: id, provider_id: 1, identifier: `guid-${id}`, is_deleted: false });
};

const isDisabled = (id) => db.users.find((u) => u.id === id).is_disabled;

describe("disableMissing", () => {
	it("disables accounts that have left the directory", async () => {
		addLinkedUser(1);
		addLinkedUser(2);

		const disabled = await disableMissing(provider(), ["guid-1"]);

		expect(disabled.map((u) => u.id)).toEqual([2]);
		expect(isDisabled(1)).toBe(false);
		expect(isDisabled(2)).toBe(true);
	});

	it("disables nobody when a run would disable more than the default limit of five", async () => {
		for (let id = 1; id <= 7; id++) {
			addLinkedUser(id);
		}

		// Only the first entry came back, as from a search cut short after one page
		const disabled = await disableMissing(provider(), ["guid-1"]);

		expect(disabled).toEqual([]);
		expect(db.users.every((u) => !u.is_disabled)).toBe(true);
	});

	it("disables up to the limit exactly", async () => {
		for (let id = 1; id <= 6; id++) {
			addLinkedUser(id);
		}

		const disabled = await disableMissing(provider(), ["guid-1"]);

		expect(disabled).toHaveLength(5);
	});

	it("honours a configured limit", async () => {
		for (let id = 1; id <= 4; id++) {
			addLinkedUser(id);
		}

		expect(await disableMissing(provider({ sync_max_disable: 2 }), ["guid-1"])).toEqual([]);
		expect(await disableMissing(provider({ sync_max_disable: 3 }), ["guid-1"])).toHaveLength(3);
	});

	it("treats a limit of 0 as no limit", async () => {
		for (let id = 1; id <= 20; id++) {
			addLinkedUser(id);
		}

		expect(await disableMissing(provider({ sync_max_disable: 0 }), ["guid-1"])).toHaveLength(19);
	});

	it("does not count accounts that an earlier run already disabled", async () => {
		addLinkedUser(1);
		for (let id = 2; id <= 10; id++) {
			addLinkedUser(id, { is_disabled: true });
		}
		addLinkedUser(11);

		const disabled = await disableMissing(provider(), ["guid-1"]);

		expect(disabled.map((u) => u.id)).toEqual([11]);
	});

	it("does not count an administrator it would keep anyway", async () => {
		db.otherAdminCanSignIn = false;
		addLinkedUser(1);
		addLinkedUser(2, { roles: ["admin"] });
		addLinkedUser(3);

		const disabled = await disableMissing(provider({ sync_max_disable: 1 }), ["guid-1"]);

		expect(disabled.map((u) => u.id)).toEqual([3]);
		expect(isDisabled(2)).toBe(false);
	});

	it("disables nobody when the directory returned nothing", async () => {
		addLinkedUser(1);

		expect(await disableMissing(provider(), [])).toEqual([]);
		expect(isDisabled(1)).toBe(false);
	});
});

describe("runSync", () => {
	it("never disables somebody the directory returned, even if provisioning them failed", async () => {
		addLinkedUser(1);
		addLinkedUser(2);
		db.directory = [
			{ identifier: "guid-1", email: "user1@example.com" },
			{ identifier: "guid-2", email: "user2@example.com" },
		];
		db.failProvisioning = ["guid-2"];

		const result = await runSync(provider({ sync_disable_missing: true }));

		expect(result).toMatchObject({ failed: 1, disabled: 0 });
		expect(isDisabled(2)).toBe(false);
	});
});
