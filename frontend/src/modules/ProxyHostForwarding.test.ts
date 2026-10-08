import { describe, expect, it } from "vitest";
import { getForwardTarget } from "./ProxyHostForwarding";

const values = {
	forwardingMode: "upstream" as const,
	forwardHost: "direct.internal",
	forwardPort: 70000,
	upstreamServers: [
		{
			host: "backend.internal",
			port: 8080,
			weight: 1,
			maxFails: 1,
			failTimeout: "30s",
			backup: false,
			down: false,
		},
	],
};

describe("inactive direct forwarding values", () => {
	it("restores the saved direct target when invalid drafts become hidden", () => {
		expect(
			getForwardTarget(
				{ ...values, forwardHost: "x".repeat(256) },
				{ forwardHost: "saved.internal", forwardPort: 80 },
			),
		).toEqual({
			forwardHost: "saved.internal",
			forwardPort: 80,
		});
	});
	it("uses the upstream member when unsaved direct values are invalid", () => {
		expect(getForwardTarget({ ...values, forwardHost: "x".repeat(256) })).toEqual({
			forwardHost: "backend.internal",
			forwardPort: 8080,
		});
	});
	it("preserves valid direct values while forwarding to an upstream", () => {
		expect(getForwardTarget({ ...values, forwardPort: 81 })).toEqual({
			forwardHost: "direct.internal",
			forwardPort: 81,
		});
	});
	it("leaves direct-mode validation to the visible fields", () => {
		expect(getForwardTarget({ ...values, forwardingMode: "direct" })).toEqual({
			forwardHost: "direct.internal",
			forwardPort: 70000,
		});
	});
	it("brackets a raw IPv6 member when creating the fallback direct address", () => {
		expect(
			getForwardTarget({
				...values,
				forwardHost: "",
				forwardPort: 0,
				upstreamServers: [{ ...values.upstreamServers[0], host: "2001:db8::1" }],
			}),
		).toEqual({ forwardHost: "[2001:db8::1]", forwardPort: 8080 });
	});
});
