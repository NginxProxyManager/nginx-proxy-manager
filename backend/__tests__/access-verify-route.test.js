import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The verify route is what nginx asks per request. Besides allow or deny, it
 * decides which credentials nginx may forward upstream when Pass Auth is on:
 * a password typed into the list may go, a directory password never does.
 */
const verifyCredentials = vi.fn();
vi.mock("../internal/access-list.js", () => ({
	default: { verifyCredentials: (...args) => verifyCredentials(...args) },
}));

const { default: router } = await import("../routes/access-verify.js");

const getHandler = router.stack
	.find((layer) => layer.route?.path === "/:listID/verify")
	.route.stack.find((layer) => layer.method === "get").handle;

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

const call = async (authorization) => {
	const res = {
		headers: {},
		statusCode: null,
		set(name, value) {
			this.headers[name] = value;
			return this;
		},
		status(code) {
			this.statusCode = code;
			return this;
		},
		send() {
			return this;
		},
	};
	await getHandler({ params: { listID: "7" }, headers: { authorization } }, res);
	return res;
};

beforeEach(() => {
	verifyCredentials.mockReset();
});

describe("GET /access-lists/:id/verify", () => {
	it("hands back the credentials of a list entry, so Pass Auth can forward them", async () => {
		verifyCredentials.mockResolvedValue({ allowed: true, via: "list", from_list: true });

		const res = await call(basic("local", "secret"));

		expect(res.statusCode).toBe(204);
		expect(res.headers["X-Auth-User"]).toBe("local");
		expect(res.headers["X-Auth-Forward-Authorization"]).toBe(basic("local", "secret"));
	});

	it("never hands back a directory user's credentials", async () => {
		verifyCredentials.mockResolvedValue({ allowed: true, via: "Company LDAP", email: "alice@example.com" });

		const res = await call(basic("alice", "ldap-password"));

		expect(res.statusCode).toBe(204);
		expect(res.headers["X-Auth-User"]).toBe("alice");
		expect(res.headers["X-Auth-Email"]).toBe("alice@example.com");
		expect(res.headers).not.toHaveProperty("X-Auth-Forward-Authorization");
	});

	it("challenges a refused visitor without echoing anything", async () => {
		verifyCredentials.mockResolvedValue({ allowed: false, reason: "bad password" });

		const res = await call(basic("alice", "wrong"));

		expect(res.statusCode).toBe(401);
		expect(res.headers).not.toHaveProperty("X-Auth-Forward-Authorization");
		expect(res.headers["WWW-Authenticate"]).toMatch(/^Basic/);
	});
});
