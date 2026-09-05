import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthStore from "src/modules/AuthStore";
import { del, download, get, post, put } from "./base";

const jsonResponse = (payload: unknown, ok = true, status = 200) =>
	({ ok, status, json: vi.fn().mockResolvedValue(payload) }) as unknown as Response;

describe("backend transport", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("builds authenticated GET, PUT, and DELETE requests and camelizes responses", async () => {
		AuthStore.set({ token: "secret", expires: 123 });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ domain_name: "example.com" }))
			.mockResolvedValueOnce(jsonResponse({ saved_value: true }))
			.mockResolvedValueOnce(jsonResponse({ deleted_id: 4 }));
		vi.stubGlobal("fetch", fetchMock);
		const controller = new AbortController();

		expect(await get({ url: "/hosts/", params: { pageSize: 10 } }, controller)).toEqual({ domainName: "example.com" });
		expect(await put({ url: "hosts/4", data: { domainName: "example.com" } }, controller)).toEqual({ savedValue: true });
		expect(await del({ url: "hosts/4" }, controller)).toEqual({ deletedId: 4 });

		expect(fetchMock.mock.calls[0][0]).toBe("/api/hosts?page_size=10");
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			method: "GET",
			headers: { Authorization: "Bearer secret" },
			signal: controller.signal,
		});
		expect(fetchMock.mock.calls[1][1]).toMatchObject({
			method: "PUT",
			body: JSON.stringify({ domain_name: "example.com" }),
		});
		expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "DELETE" });
	});

	it("supports public JSON posts, authenticated form posts, and translated errors", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ access_token: "ok" }))
			.mockResolvedValueOnce(jsonResponse({ uploaded: true }))
			.mockResolvedValueOnce(jsonResponse({ error: { message_i18n: "error.denied", message: "Denied" } }, false, 400));
		vi.stubGlobal("fetch", fetchMock);

		expect(await post({ url: "tokens", noAuth: true, data: { userName: "a" } })).toEqual({ accessToken: "ok" });
		const form = new FormData();
		form.set("file", new Blob(["x"]), "x.txt");
		expect(await post({ url: "upload", data: form })).toEqual({ uploaded: true });
		await expect(get({ url: "denied" })).rejects.toThrow("error.denied");

		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ user_name: "a" }),
		});
		expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", headers: {}, body: form });
	});

	it("downloads blobs and revokes the generated object URL", async () => {
		const blob = new Blob(["content"]);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(blob) }));
		const createObjectURL = vi.fn().mockReturnValue("blob:test");
		const revokeObjectURL = vi.fn();
		Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: createObjectURL });
		Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

		await download({ url: "exports", params: { hostId: 7 } }, "hosts.json");
		expect(createObjectURL).toHaveBeenCalledWith(blob);
		expect(click).toHaveBeenCalled();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
	});
});
