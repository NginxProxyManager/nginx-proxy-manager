import { describe, expect, it } from "vitest";
import { parseForwardUrl } from "./ForwardUrl";

describe("parseForwardUrl", () => {
	it("splits a full url", () => {
		expect(parseForwardUrl("http://192.168.5.150:8096")).toEqual({
			scheme: "http",
			host: "192.168.5.150",
			port: 8096,
			path: undefined,
		});
	});

	it("splits https and defaults the port", () => {
		expect(parseForwardUrl("https://example.com")).toEqual({
			scheme: "https",
			host: "example.com",
			port: 443,
			path: undefined,
		});
	});

	it("splits host:port without touching the scheme", () => {
		expect(parseForwardUrl("192.168.5.150:8096")).toEqual({
			scheme: undefined,
			host: "192.168.5.150",
			port: 8096,
			path: undefined,
		});
	});

	it("keeps the path separate", () => {
		expect(parseForwardUrl("http://example.com:8080/web/index.html")).toEqual({
			scheme: "http",
			host: "example.com",
			port: 8080,
			path: "/web/index.html",
		});
	});

	it("keeps the query string with the path", () => {
		expect(parseForwardUrl("http://example.com:8080/web?x=1")?.path).toEqual("/web?x=1");
	});

	it("rejects input the url parser would rewrite into a different host", () => {
		// these would otherwise become ip addresses the user never typed
		expect(parseForwardUrl("5000:8080")).toBeNull();
		expect(parseForwardUrl("192.168.1:8080")).toBeNull();
	});

	it("ignores things that are not worth splitting", () => {
		expect(parseForwardUrl("example.com")).toBeNull();
		expect(parseForwardUrl("192.168.5.150")).toBeNull();
		expect(parseForwardUrl("ftp://example.com:21")).toBeNull();
		expect(parseForwardUrl("not a url")).toBeNull();
		expect(parseForwardUrl("")).toBeNull();
	});
});
