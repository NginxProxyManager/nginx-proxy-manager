import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Refreshing a token must reflect the account as it is now, not as it was when
 * the token was issued, and a failed sign in must take the same time whichever
 * check turned it down.
 */
const db = { users: [], ldapDelayMs: 0 };

vi.mock("../models/user.js", () => ({
	default: {
		query: () => {
			const filters = [];
			const builder = {
				where(field, value) {
					filters.push([field, value]);
					return builder;
				},
				andWhere(...args) {
					return builder.where(...args);
				},
				first: async () => db.users.find((u) => filters.every(([k, v]) => u[k] === v)),
			};
			return builder;
		},
	},
}));
vi.mock("../models/auth.js", () => ({ default: {} }));
vi.mock("../models/token.js", () => ({
	default: () => ({ create: async (payload) => ({ token: JSON.stringify(payload) }) }),
}));
vi.mock("../internal/2fa.js", () => ({ default: { isEnabled: async () => false } }));
vi.mock("../internal/auth-provider.js", () => ({
	default: {
		isLocalAuthEnabled: async () => false,
		authenticateLdap: async () => {
			await new Promise((resolve) => setTimeout(resolve, db.ldapDelayMs));
			return null;
		},
	},
}));

const { default: internalToken } = await import("../internal/token.js");

/** A stand-in for the Access object a request carries */
const access = (userId, scope) => ({
	token: {
		getUserId: () => userId,
		get: (key) => (key === "scope" ? scope : null),
		hasScope: (s) => scope.includes(s),
	},
});

const addUser = (id, roles = [], opts = {}) => {
	db.users.push({ id, roles, is_deleted: 0, is_disabled: 0, ...opts });
};

beforeEach(() => {
	db.users = [];
	db.ldapDelayMs = 0;
});

describe("getFreshToken", () => {
	it("refreshes the token of an active account", async () => {
		addUser(1);

		const result = await internalToken.getFreshToken(access(1, ["user"]));

		expect(JSON.parse(result.token)).toMatchObject({ scope: ["user"], attrs: { id: 1 } });
	});

	it("refuses a disabled account", async () => {
		addUser(1, [], { is_disabled: 1 });

		await expect(internalToken.getFreshToken(access(1, ["user"]))).rejects.toThrow(/cannot be loaded/);
	});

	it("refuses a deleted account", async () => {
		addUser(1, [], { is_deleted: 1 });

		await expect(internalToken.getFreshToken(access(1, ["user"]))).rejects.toThrow(/cannot be loaded/);
	});

	it("refuses an admin scoped token for somebody who is no longer an admin", async () => {
		addUser(1, []);

		await expect(internalToken.getFreshToken(access(1, ["admin"]))).rejects.toThrow(/no longer holds/);
	});

	it("does not let a demoted admin swap scopes", async () => {
		addUser(1, []);

		const result = await internalToken.getFreshToken(access(1, ["user", "admin"]), { scope: "job-board" });

		expect(JSON.parse(result.token)).toMatchObject({ scope: ["user"], attrs: { id: 1 } });
	});
});

describe("failed sign in timing", () => {
	const nodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		// The delay is skipped under test, so switch that off here
		process.env.NODE_ENV = "production";
		vi.useFakeTimers();
	});

	afterEach(() => {
		process.env.NODE_ENV = nodeEnv;
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const timeFailure = async () => {
		const started = Date.now();
		const attempt = internalToken.getTokenFromEmail({ identity: "nobody", secret: "wrong" });
		const settled = attempt.catch((err) => err);
		await vi.runAllTimersAsync();
		expect(await settled).toBeInstanceOf(Error);
		return Date.now() - started;
	};

	it("pads to the same total whether the directory answered quickly or slowly", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);

		db.ldapDelayMs = 0;
		const fast = await timeFailure();
		db.ldapDelayMs = 400;
		const slow = await timeFailure();

		expect(fast).toBe(2000);
		expect(slow).toBe(2000);
	});
});
