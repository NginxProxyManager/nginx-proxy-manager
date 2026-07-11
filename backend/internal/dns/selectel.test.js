import { beforeEach, describe, expect, it, vi } from "vitest";
import selectel, { __resetCache, __setFetch, resolveZone } from "./selectel.js";

describe("resolveZone", () => {
	const zones = [
		{ id: "z1", name: "example.com" },
		{ id: "z2", name: "sub.example.com" },
		{ id: "z3", name: "other.org" },
	];

	it("matches exact zone", () => {
		expect(resolveZone("example.com", zones)?.id).toBe("z1");
	});

	it("matches subdomain to parent zone", () => {
		expect(resolveZone("app.example.com", zones)?.id).toBe("z1");
	});

	it("prefers the longest matching zone", () => {
		expect(resolveZone("api.sub.example.com", zones)?.id).toBe("z2");
	});

	it("returns null when no zone matches", () => {
		expect(resolveZone("nomatch.net", zones)).toBeNull();
	});

	it("does not match partial label (foobar vs bar)", () => {
		expect(resolveZone("foobarexample.com", [{ id: "z9", name: "barexample.com" }])).toBeNull();
	});

	it("matches case-insensitively", () => {
		expect(resolveZone("APP.Example.COM", zones)?.id).toBe("z1");
	});

	it("tolerates a trailing dot on the domain", () => {
		expect(resolveZone("app.example.com.", zones)?.id).toBe("z1");
	});
});

const creds = { account_id: "111", project_name: "proj", username: "u", password: "p" };

const jsonResponse = (body, init = {}) => ({
	ok: init.status ? init.status < 400 : true,
	status: init.status || 200,
	headers: { get: (h) => (h.toLowerCase() === "x-subject-token" ? "TOKEN123" : null) },
	json: async () => body,
	text: async () => JSON.stringify(body),
});

describe("selectel driver", () => {
	beforeEach(() => {
		__resetCache();
	});

	it("authenticate returns keystone token from x-subject-token header", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }));
		__setFetch(fetchMock);
		const token = await selectel.authenticate(creds);
		expect(token).toBe("TOKEN123");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://cloud.api.selectel.ru/identity/v3/auth/tokens",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("createRecord resolves zone and posts an A rrset", async () => {
		const fetchMock = vi
			.fn()
			// auth
			.mockResolvedValueOnce(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }))
			// list zones
			.mockResolvedValueOnce(jsonResponse({ result: [{ id: "zone-1", name: "example.com" }] }))
			// create rrset
			.mockResolvedValueOnce(jsonResponse({ id: "rrset-9" }));
		__setFetch(fetchMock);

		const res = await selectel.createRecord(creds, "app.example.com", "203.0.113.5", 300);
		expect(res).toEqual({ zone_id: "zone-1", rrset_id: "rrset-9" });

		const [url, opts] = fetchMock.mock.calls[2];
		expect(url).toBe("https://api.selectel.ru/domains/v2/zones/zone-1/rrset");
		const body = JSON.parse(opts.body);
		expect(body).toMatchObject({ name: "app.example.com.", type: "A", ttl: 300 });
		expect(body.records[0].content).toBe("203.0.113.5");
	});

	it("createRecord throws when no zone matches", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }))
			.mockResolvedValueOnce(jsonResponse({ result: [{ id: "z", name: "other.org" }] }));
		__setFetch(fetchMock);
		await expect(selectel.createRecord(creds, "app.example.com", "1.2.3.4", 300)).rejects.toThrow(/zone/i);
	});

	it("deleteRecord issues DELETE to the rrset endpoint", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }))
			.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));
		__setFetch(fetchMock);
		await selectel.deleteRecord(creds, { zone_id: "zone-1", rrset_id: "rrset-9" });
		const [url, opts] = fetchMock.mock.calls[1];
		expect(url).toBe("https://api.selectel.ru/domains/v2/zones/zone-1/rrset/rrset-9");
		expect(opts.method).toBe("DELETE");
	});

	it("testConnection returns ok:false with message on auth failure", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad creds" }, { status: 401 }));
		__setFetch(fetchMock);
		const res = await selectel.testConnection(creds);
		expect(res.ok).toBe(false);
		expect(res.error).toBeTruthy();
	});
});
