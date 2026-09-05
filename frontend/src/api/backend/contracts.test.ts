import { beforeEach, describe, expect, it, vi } from "vitest";

import * as transport from "./base";
import * as api from "./index";

vi.mock("./base", () => ({
	get: vi.fn(async (request) => request),
	post: vi.fn(async (request) => request),
	put: vi.fn(async (request) => request),
	del: vi.fn(async (request) => request),
	download: vi.fn(async () => undefined),
}));

const item = { id: 7, createdOn: "old", modifiedOn: "old", name: "example" };
const asModel = item as never;

describe("backend API contracts", () => {
	beforeEach(() => vi.clearAllMocks());

	it("uses the expected paths for collection and singleton reads", async () => {
		await api.checkVersion();
		await api.getHealth();
		await api.getHostsReport();
		await api.refreshToken();
		await api.getAccessList(7, ["items"], { page: 2 });
		await api.getAccessLists(undefined, { query: "a" });
		await api.getAuditLog(7, ["user"]);
		await api.getAuditLogs();
		await api.getCertificate(7, ["owner"]);
		await api.getCertificates();
		await api.getCertificateDNSProviders({ active: true });
		await api.getDeadHost(7, ["owner"]);
		await api.getDeadHosts();
		await api.getProxyHost(7, ["owner", "access_list"]);
		await api.getProxyHosts();
		await api.getRedirectionHost(7, ["owner"]);
		await api.getRedirectionHosts();
		await api.getSetting("default-site", ["details"]);
		await api.getSettings();
		await api.getStream(7, ["owner"]);
		await api.getStreams();
		await api.getUser();
		await api.getUser(0);
		await api.getUsers(["permissions"]);
		await api.getUpstream(7);
		await api.getUpstreams({ page: 3 });
		await api.getNginxHostLog("proxy-hosts", 7, "access", 50);
		await api.getNginxHostLog("proxy-hosts", 8, "error");
		await api.getProxyHostNginxConfig(7);
		await api.getProxyHostNginxConfig(8, ["candidate"]);
		await api.getProxyHostMonitoring(7, { from: "start" });
		await api.getProxyHostMonitoringTimeseries(7, { resolution: "hour" });

		expect(vi.mocked(transport.get).mock.calls.map(([request]) => request)).toEqual([
			{ url: "/version/check" },
			{ url: "/" },
			{ url: "/reports/hosts" },
			{ url: "/tokens" },
			{ url: "/nginx/access-lists/7", params: { expand: "items", page: 2 } },
			{ url: "/nginx/access-lists", params: { expand: undefined, query: "a" } },
			{ url: "/audit-log/7", params: { expand: "user" } },
			{ url: "/audit-log", params: { expand: undefined } },
			{ url: "/nginx/certificates/7", params: { expand: "owner" } },
			{ url: "/nginx/certificates", params: { expand: undefined } },
			{ url: "/nginx/certificates/dns-providers", params: { active: true } },
			{ url: "/nginx/dead-hosts/7", params: { expand: "owner" } },
			{ url: "/nginx/dead-hosts", params: { expand: undefined } },
			{ url: "/nginx/proxy-hosts/7", params: { expand: "owner,access_list" } },
			{ url: "/nginx/proxy-hosts", params: { expand: undefined } },
			{ url: "/nginx/redirection-hosts/7", params: { expand: "owner" } },
			{ url: "/nginx/redirection-hosts", params: { expand: undefined } },
			{ url: "/settings/default-site", params: { expand: "details" } },
			{ url: "/settings", params: { expand: undefined } },
			{ url: "/nginx/streams/7", params: { expand: "owner" } },
			{ url: "/nginx/streams", params: { expand: undefined } },
			{ url: "/users/me", params: { expand: undefined } },
			{ url: "/users/me", params: { expand: undefined } },
			{ url: "/users", params: { expand: "permissions" } },
			{ url: "/nginx/upstreams/7" },
			{ url: "/nginx/upstreams", params: { page: 3 } },
			{ url: "/nginx/proxy-hosts/7/logs/access", params: { tail_lines: 50 } },
			{ url: "/nginx/proxy-hosts/8/logs/error", params: { tail_lines: 200 } },
			{ url: "/nginx/proxy-hosts/7/nginx-config", params: { include_content: "deployed,candidate" } },
			{ url: "/nginx/proxy-hosts/8/nginx-config", params: { include_content: "candidate" } },
			{ url: "/nginx/proxy-hosts/7/monitoring", params: { from: "start" } },
			{ url: "/nginx/proxy-hosts/7/monitoring/timeseries", params: { resolution: "hour" } },
		]);
	});

	it("uses the expected paths and payloads for creates and actions", async () => {
		await api.createAccessList(asModel);
		await api.createCertificate(asModel);
		await api.createDeadHost(asModel);
		await api.createProxyHost(asModel);
		await api.createRedirectionHost(asModel);
		await api.createStream(asModel);
		await api.createUser({ name: "Person", nickname: "person", email: "person@example.test" }, true);
		await api.createUpstream(item);
		await api.getToken("person", "secret");
		await api.verify2FA("challenge", "123456");
		await api.loginAsUser(7);
		await api.previewProxyHostNginxConfig(item);
		await api.probeProxyHost(7);
		await api.publishUpstream(7);
		await api.renewCertificate(7);
		await api.testHttpCertificate(["example.test"]);
		await api.start2FASetup("me");
		await api.enable2FA(7, "123456");
		await api.regenerateBackupCodes(7, "654321");
		const form = new FormData();
		await api.uploadCertificate(7, form);
		await api.validateCertificate(form);

		const calls = vi.mocked(transport.post).mock.calls.map(([request]) => request);
		expect(calls.map(({ url }) => url)).toEqual([
			"/nginx/access-lists",
			"/nginx/certificates",
			"/nginx/dead-hosts",
			"/nginx/proxy-hosts",
			"/nginx/redirection-hosts",
			"/nginx/streams",
			"/users",
			"/nginx/upstreams",
			"/tokens",
			"/tokens/2fa",
			"/users/7/login",
			"/nginx/proxy-hosts/nginx-config/preview",
			"/nginx/proxy-hosts/7/monitoring/probe",
			"/nginx/upstreams/7/publish",
			"/nginx/certificates/7/renew",
			"/nginx/certificates/test-http",
			"/users/me/2fa",
			"/users/7/2fa/enable",
			"/users/7/2fa/backup-codes",
			"/nginx/certificates/7/upload",
			"/nginx/certificates/validate",
		]);
		expect(calls[6]).toEqual({
			url: "/users",
			data: { name: "Person", nickname: "person", email: "person@example.test" },
			noAuth: true,
		});
		expect(calls[8]).toEqual({ url: "/tokens", data: { identity: "person", secret: "secret" } });
		expect(calls[15]).toEqual({ url: "/nginx/certificates/test-http", data: { domains: ["example.test"] } });
		expect(calls[19]?.data).toBe(form);
	});

	it("strips readonly fields from updates and handles user toggles", async () => {
		await api.updateAccessList(asModel);
		await api.updateDeadHost(asModel);
		await api.updateProxyHost(asModel);
		await api.updateRedirectionHost(asModel);
		await api.updateStream(asModel);
		await api.updateUser(asModel);
		await api.updateSetting(asModel);
		await api.updateUpstream(item);
		await api.updateAuth("me", "new", "old");
		await api.updateAuth(7, "new");
		await api.setPermissions(7, { proxyHosts: "manage" } as never);
		await api.updateProxyHostMonitoring(7, { enabled: true });
		expect(await api.toggleUser(7, true)).toBe(true);
		expect(await api.toggleUser(8, false)).toBe(true);

		const calls = vi.mocked(transport.put).mock.calls.map(([request]) => request);
		expect(calls.slice(0, 6).every(({ data }) => !Object.prototype.hasOwnProperty.call(data, "id"))).toBe(true);
		expect(calls.slice(0, 6).every(({ data }) => !Object.prototype.hasOwnProperty.call(data, "createdOn"))).toBe(true);
		expect(calls[6]).toEqual({ url: "/settings/7", data: { createdOn: "old", modifiedOn: "old", name: "example" } });
		expect(calls[7]).toEqual({ url: "/nginx/upstreams/7", data: { createdOn: "old", modifiedOn: "old", name: "example" } });
		expect(calls[8]).toEqual({ url: "/users/me/auth", data: { type: "password", current: "old", secret: "new" } });
		expect(calls[9]).toEqual({ url: "/users/7/auth", data: { type: "password", current: undefined, secret: "new" } });
		expect(calls[calls.length - 2]).toEqual({ url: "/users/7", data: { isDisabled: false } });
		expect(calls[calls.length - 1]).toEqual({ url: "/users/8", data: { isDisabled: true } });
	});

	it("uses the expected delete, toggle and download contracts", async () => {
		await api.deleteAccessList(7);
		await api.deleteCertificate(7);
		await api.deleteDeadHost(7);
		await api.deleteProxyHost(7);
		await api.deleteRedirectionHost(7);
		await api.deleteStream(7);
		await api.deleteUser(7);
		await api.deleteUpstream(7);
		await api.disable2FA("me", "123456");
		await api.toggleDeadHost(7, true);
		await api.toggleDeadHost(8, false);
		await api.toggleProxyHost(7, true);
		await api.toggleProxyHost(8, false);
		await api.toggleRedirectionHost(7, true);
		await api.toggleRedirectionHost(8, false);
		await api.toggleStream(7, true);
		await api.toggleStream(8, false);
		await api.get2FAStatus("me");
		await api.downloadCertificate(7);

		expect(vi.mocked(transport.del).mock.calls.map(([request]) => request)).toEqual([
			{ url: "/nginx/access-lists/7" },
			{ url: "/nginx/certificates/7" },
			{ url: "/nginx/dead-hosts/7" },
			{ url: "/nginx/proxy-hosts/7" },
			{ url: "/nginx/redirection-hosts/7" },
			{ url: "/nginx/streams/7" },
			{ url: "/users/7" },
			{ url: "/nginx/upstreams/7" },
			{ url: "/users/me/2fa", params: { code: "123456" } },
		]);
		expect(vi.mocked(transport.post).mock.calls.map(([request]) => request.url)).toEqual([
			"/nginx/dead-hosts/7/enable",
			"/nginx/dead-hosts/8/disable",
			"/nginx/proxy-hosts/7/enable",
			"/nginx/proxy-hosts/8/disable",
			"/nginx/redirection-hosts/7/enable",
			"/nginx/redirection-hosts/8/disable",
			"/nginx/streams/7/enable",
			"/nginx/streams/8/disable",
		]);
		expect(transport.get).toHaveBeenCalledWith({ url: "/users/me/2fa" });
		expect(transport.download).toHaveBeenCalledWith(
			{ url: "/nginx/certificates/7/download" },
			"certificate-7.zip",
		);
	});

	it("recognizes only explicit two-factor challenges", () => {
		expect(api.isTwoFactorChallenge({ requires2fa: true } as never)).toBe(true);
		expect(api.isTwoFactorChallenge({ requires2fa: false } as never)).toBe(false);
		expect(api.isTwoFactorChallenge({ token: "token" } as never)).toBe(false);
	});
});
