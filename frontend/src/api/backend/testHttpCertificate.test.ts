import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./base";
import { testHttpCertificate } from "./testHttpCertificate";

const fetchMock = vi.fn<typeof fetch>();
const reply = (payload: unknown, status = 200) => {
	fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status }));
};
beforeEach(() => {
	localStorage.clear();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	fetchMock.mockReset();
});
describe("certificate HTTP result keys", () => {
	it.each([
		"test-domain.example",
		"test--domain.example",
		"xn--bcher-kva.example",
		"one.two-three.example",
		"_acme-challenge.example",
		"Test-Domain.example",
		"plain.example",
	])("preserves the exact response key %s", async (domain) => {
		const result = { [domain]: "wrong-data" };
		reply(result);
		expect(await testHttpCertificate([domain])).toEqual(result);
	});
	it("keeps colliding spellings and their distinct statuses", async () => {
		const result = { "test-domain.example": "ok", "test--domain.example": "no-host" };
		reply(result);
		expect(await testHttpCertificate(Object.keys(result))).toEqual(result);
	});
	it("sends unchanged domains with the normal request headers", async () => {
		const domains = ["test-domain.example", "test--domain.example"];
		reply({});
		await testHttpCertificate(domains);
		expect(fetchMock).toHaveBeenCalledWith("/api/nginx/certificates/test-http", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domains }),
			signal: undefined,
		});
	});
	it("preserves an empty result", async () => {
		reply({});
		expect(await testHttpCertificate([])).toEqual({});
	});
	it.each([
		[400, { message: "invalid domain" }, "invalid domain"],
		[500, { message: "fallback", messageI18n: "certificate-error" }, "certificate-error"],
	])("preserves error handling for status %s", async (status, error, message) => {
		reply({ error }, status);
		await expect(testHttpCertificate(["test-domain.example"])).rejects.toThrow(message);
	});
	it("still clears authentication on 401", async () => {
		const clear = vi.spyOn(AuthStore, "clear");
		const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
		reply({ error: { message: "unauthorized" } }, 401);
		await expect(testHttpCertificate(["test-domain.example"])).rejects.toThrow("unauthorized");
		expect(clear).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});
	it.each([
		["get", api.get],
		["post", api.post],
		["put", api.put],
		["del", api.del],
	] as const)("keeps default %s response normalization", async (_name, method) => {
		reply({ domain_names: ["test-domain.example"], nested_value: { created_on: "today" } });
		expect(await method({ url: "/control" })).toEqual({
			domainNames: ["test-domain.example"],
			nestedValue: { createdOn: "today" },
		});
	});
	it("preserves POST abort forwarding and request normalization", async () => {
		const controller = new AbortController();
		reply({ domain_names: [] });
		await api.post({ url: "/control", data: { domainNames: ["a-b.example"] } }, controller);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/control",
			expect.objectContaining({
				body: JSON.stringify({ domain_names: ["a-b.example"] }),
				signal: controller.signal,
			}),
		);
	});
});
