import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiToken, getApiTokenOptions, getApiTokens, revokeApiToken } from "./apiTokens";

vi.mock("src/modules/AuthStore", () => ({ default: { token: { token: "test-session" } } }));
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("API token client", () => {
	it("loads and camelizes metadata and conditional 2FA options", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json([{ id: 1, name: "Test", created_on: "2026-10-14T00:00:00Z", last_used_on: null }]),
			)
			.mockResolvedValueOnce(
				Response.json({
					scopes: ["proxy_hosts:read"],
					requires_2fa: true,
					max_expiry_days: 365,
					default_expiry_days: 30,
				}),
			);
		vi.stubGlobal("fetch", fetch);
		expect(await getApiTokens()).toEqual([
			{ id: 1, name: "Test", createdOn: "2026-10-14T00:00:00Z", lastUsedOn: null },
		]);
		expect(await getApiTokenOptions()).toEqual({
			scopes: ["proxy_hosts:read"],
			requires2fa: true,
			maxExpiryDays: 365,
			defaultExpiryDays: 30,
		});
		expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/api-tokens", "/api/api-tokens/options"]);
	});

	it("posts credentials only in the request body without changing scope strings", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValue(Response.json({ id: 1, token: "test-only-secret", expires_on: "2026-11-14T00:00:00Z" }));
		vi.stubGlobal("fetch", fetch);
		expect(
			await createApiToken({
				name: "Test",
				scopes: ["proxy_hosts:write"],
				expiresInDays: 30,
				password: "test-password",
				code: "123456",
			}),
		).toEqual({ id: 1, token: "test-only-secret", expiresOn: "2026-11-14T00:00:00Z" });
		const [url, request] = fetch.mock.calls[0];
		expect(url).toBe("/api/api-tokens");
		expect(request.method).toBe("POST");
		expect(request.headers.Authorization).toBe("Bearer test-session");
		expect(JSON.parse(request.body)).toEqual({
			name: "Test",
			scopes: ["proxy_hosts:write"],
			expires_in_days: 30,
			password: "test-password",
			code: "123456",
		});
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("does not automatically retry a failed creation and uses the token id for revocation", async () => {
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(new Error("Network error"))
			.mockResolvedValueOnce(Response.json({ revoked: true }));
		vi.stubGlobal("fetch", fetch);
		await expect(
			createApiToken({ name: "Test", scopes: ["streams:read"], expiresInDays: 1, password: "test-password" }),
		).rejects.toThrow("Network error");
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(await revokeApiToken(42)).toEqual({ revoked: true });
		expect(fetch.mock.calls[1][0]).toBe("/api/api-tokens/42");
		expect(fetch.mock.calls[1][1].method).toBe("DELETE");
	});
});
