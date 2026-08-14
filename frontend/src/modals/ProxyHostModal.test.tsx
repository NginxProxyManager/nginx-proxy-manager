import { describe, expect, it } from "vitest";
import { prepareProxyHostValues, usesManagedDefaultLocation } from "./ProxyHostModal";

describe("ProxyHostModal semantic payload", () => {
	it("materializes a complete server policy and a safe unused target when the default Location is disabled", () => {
		const prepared = prepareProxyHostValues({
			domainNames: ["semantic.example.com"],
			forwardScheme: "http",
			forwardHost: "",
			forwardPort: undefined,
			defaultTarget: { type: "direct", scheme: "http", host: "", port: 80 },
			nginxConfig: {
				listener: { mode: "domain" },
				server: {
					defaultLocationEnabled: false,
					proxyPassTrailers: false,
					proxyNextUpstream: [],
				},
			},
			locations: [],
		});

		expect(prepared.defaultTarget).toEqual({ type: "direct", scheme: "http", host: "127.0.0.1", port: 80 });
		expect(prepared.nginxConfig.server.directives.proxyPassTrailers).toBe(false);
		expect(prepared.nginxConfig.server.directives.proxyNextUpstream).toEqual(["error", "timeout"]);
		expect(Object.keys(prepared.nginxConfig.server.directives).length).toBeGreaterThan(30);
	});

	it("persists sparse Location overrides even when they equal inherited values or clear inherited lists", () => {
		const prepared = prepareProxyHostValues({
			domainNames: ["semantic.example.com"],
			defaultTarget: { type: "direct", scheme: "http", host: "127.0.0.1", port: 8080 },
			nginxConfig: {
				listener: { mode: "domain" },
				server: { proxyPassTrailers: false, hideResponseHeadersInput: "Server" },
			},
			locations: [
				{
					path: "/api/",
					target: { type: "direct", scheme: "http", host: "127.0.0.1", port: 8081 },
					nginxConfig: {
						proxyPassTrailers: false,
						hideResponseHeadersInput: "",
					},
					nginxOverrideKeys: ["proxyPassTrailers", "hideResponseHeaders"],
				},
			],
		});

		expect(prepared.locations[0].nginxOverrideKeys).toBeUndefined();
		expect(prepared.locations[0].nginxConfig.overrides.directives).toEqual({ proxyPassTrailers: false });
		expect(prepared.locations[0].nginxConfig.overrides.headers).toEqual({ hideResponse: [] });
	});

	it("only allows proxy_redirect default when the variable-backed managed root Location is not rendered", () => {
		expect(usesManagedDefaultLocation({ nginxConfig: { server: {} }, locations: [], advancedConfig: "" })).toBe(
			true,
		);
		expect(
			usesManagedDefaultLocation({
				nginxConfig: { server: { defaultLocationEnabled: false } },
				locations: [],
			}),
		).toBe(false);
		expect(
			usesManagedDefaultLocation({
				nginxConfig: { server: {} },
				locations: [{ path: "/", matchType: "prefix" }],
			}),
		).toBe(false);
		expect(
			usesManagedDefaultLocation({
				nginxConfig: { server: {} },
				locations: [],
				advancedConfig: "location / { return 204; }",
			}),
		).toBe(false);
	});
});
