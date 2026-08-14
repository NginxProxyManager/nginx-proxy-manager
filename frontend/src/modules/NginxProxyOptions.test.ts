import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROXY_DIRECTIVE_CATALOG } from "src/generated/proxyDirectiveCatalog";
import { describe, expect, it } from "vitest";
import {
	appendProxyOverrideKey,
	DEFAULT_PROXY_LOCATION_OPTIONS,
	diffProxyOptions,
	flattenProxyOptionSections,
	groupProxyOptions,
	materializeProxyLocationOptions,
	materializeProxyServerOptions,
	normalizeProxyOptionsForApi,
	proxyOptionKeyFromFieldName,
} from "./NginxProxyOptions";

describe("semantic proxy option profile", () => {
	it("materializes every catalog option including explicit disabled values", () => {
		expect(Object.keys(DEFAULT_PROXY_LOCATION_OPTIONS)).toHaveLength(PROXY_DIRECTIVE_CATALOG.directives.length);
		expect(DEFAULT_PROXY_LOCATION_OPTIONS.proxyPassTrailers).toBe(false);
		expect(materializeProxyServerOptions().defaultLocationEnabled).toBe(true);
		expect(materializeProxyLocationOptions({ proxyPassTrailers: true }).proxyPassTrailers).toBe(true);
	});

	it("keeps the manual semantic UI exhaustive against the generated catalog", () => {
		const uiSource = readFileSync(join(process.cwd(), "src/components/Form/ProxyDirectivesFields.tsx"), "utf8");
		for (const entry of PROXY_DIRECTIVE_CATALOG.directives) {
			expect(uiSource, `${entry.key} / ${entry.frontendKey}`).toContain(entry.frontendKey);
		}
		for (const header of [
			"X-Accel-Expires",
			"X-Accel-Redirect",
			"X-Accel-Limit-Rate",
			"X-Accel-Buffering",
			"X-Accel-Charset",
			"Expires",
			"Cache-Control",
			"Set-Cookie",
			"Vary",
		]) {
			expect(uiSource, `proxy_ignore_headers option ${header}`).toContain(`value: "${header}"`);
		}
	});

	it("round-trips grouped API sections using frontend camelCase keys", () => {
		const options = {
			proxyPassTrailers: false,
			proxyReadTimeout: "45s",
			requestHeaders: [{ name: "X-Test", operation: "set" as const, value: "yes" }],
			hideResponseHeaders: ["Server"],
			proxyPassHeaders: ["X-Upstream"],
			proxyIgnoreHeaders: ["Set-Cookie"],
		};
		const grouped = groupProxyOptions(options);
		expect(grouped.directives?.proxyPassTrailers).toBe(false);
		expect(grouped.headers?.hideResponse).toEqual(["Server"]);
		expect(grouped.headers?.passResponse).toEqual(["X-Upstream"]);
		expect(grouped.headers?.ignoreUpstream).toEqual(["Set-Cookie"]);
		expect(flattenProxyOptionSections(grouped)).toEqual(options);
	});

	it("computes sparse Location overrides while allowing callers to retain explicit equal keys", () => {
		const inherited = materializeProxyLocationOptions();
		const effective = { ...inherited, proxyReadTimeout: "30s", proxyPassTrailers: false };
		expect(diffProxyOptions(effective, inherited)).toEqual({ proxyReadTimeout: "30s" });
		expect(
			groupProxyOptions({ proxyPassTrailers: effective.proxyPassTrailers }).directives?.proxyPassTrailers,
		).toBe(false);
	});
	it("restores required server lists from the versioned profile when a form list is cleared", () => {
		const normalized = normalizeProxyOptionsForApi({ proxyNextUpstream: [], proxySslProtocols: [] });
		expect(normalized.proxyNextUpstream).toBeUndefined();
		expect(normalized.proxySslProtocols).toBeUndefined();
		const server = materializeProxyServerOptions(normalized);
		expect(server.proxyNextUpstream).toEqual(["error", "timeout"]);
		expect(server.proxySslProtocols).toEqual(["TLSv1.2", "TLSv1.3"]);
	});

	it("preserves explicit empty header lists instead of dropping Location overrides", () => {
		expect(
			normalizeProxyOptionsForApi({
				hideResponseHeadersInput: "",
				proxyPassHeadersInput: "  ",
			}),
		).toEqual({ hideResponseHeaders: [], proxyPassHeaders: [] });
	});

	it("tracks sparse Location override keys including compound and form-only fields", () => {
		expect(proxyOptionKeyFromFieldName("locations.0.nginxConfig", "locations.0.nginxConfig.proxyBuffers.1")).toBe(
			"proxyBuffers",
		);
		expect(
			proxyOptionKeyFromFieldName("locations.0.nginxConfig", "locations.0.nginxConfig.hideResponseHeadersInput"),
		).toBe("hideResponseHeaders");
		expect(appendProxyOverrideKey([], "proxyPassTrailers")).toEqual(["proxyPassTrailers"]);
		expect(appendProxyOverrideKey(["proxyPassTrailers"], "proxyPassTrailers")).toEqual(["proxyPassTrailers"]);
	});
});
