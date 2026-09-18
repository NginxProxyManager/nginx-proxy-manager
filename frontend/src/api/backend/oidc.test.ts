import { afterEach, expect, test, vi } from "vitest";
import { getOIDCStatus, oidcRequest, startOIDC } from "./oidc";

vi.mock("src/modules/AuthStore", () => ({ default: { token: null } }));
afterEach(() => vi.unstubAllGlobals());

test("settings validation retains the actionable public error", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValue(
				Response.json({ error: { code: 400, message: "Scopes must include openid" } }, { status: 400 }),
			),
	);
	await expect(oidcRequest("settings", "PUT", {})).rejects.toThrow("Scopes must include openid");
});

test("server and protocol failures retain a generic error", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValue(
			Response.json({ error: { message: "provider response or internal details" } }, { status: 500 }),
		);
	vi.stubGlobal("fetch", fetch);
	await expect(oidcRequest("settings", "PUT", {})).rejects.toThrow("Check the settings or sign in locally");
	fetch.mockResolvedValue(Response.json({ error: { message: "provider response" } }, { status: 400 }));
	await expect(oidcRequest("start", "POST", {})).rejects.toThrow("Check the settings or sign in locally");
});

test("status and start requests honor the login component cancellation signal", async () => {
	const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ url: "https://id.example" })));
	vi.stubGlobal("fetch", fetch);
	const { signal } = new AbortController();
	await getOIDCStatus(signal);
	await startOIDC(signal);
	for (const call of fetch.mock.calls) expect(call[1].signal).toBe(signal);
});
