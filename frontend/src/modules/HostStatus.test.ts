import type { HostMeta, UpstreamHealthTarget, UpstreamHostHealth } from "src/api/backend";
import { describe, expect, it } from "vitest";
import {
	getHostStatus,
	getTestLocationIndex,
	hostStatusRank,
	isVariableHost,
	locationHostPart,
	sortByHostStatus,
} from "./HostStatus";

const row = (name: string, enabled: boolean, meta: HostMeta | null) => ({ name, original: { enabled, meta } });

describe("sorting the status column", () => {
	it("sorts by the shown status, the hosts nginx rejected first", () => {
		const rows = [
			row("online", true, { nginxOnline: true }),
			row("error", true, { nginxOnline: false, nginxErr: "x" }),
			row("disabled", false, { nginxOnline: false }),
			row("online without meta", true, null),
		];
		expect([...rows].sort(sortByHostStatus).map((r) => r.name)).toEqual([
			"error",
			"disabled",
			"online",
			"online without meta",
		]);
	});

	it("puts hosts with problem locations right after the ones nginx rejected", () => {
		const problem = {
			nginxOnline: true,
			nginxLocations: [{ index: 0, path: "/api", status: "quarantined", mode: null, message: "rejected" }],
		} as HostMeta;
		const rows = [
			row("online", true, { nginxOnline: true }),
			row("disabled", false, null),
			row("warning", true, problem),
			row("error", true, { nginxOnline: false }),
		];
		expect([...rows].sort(sortByHostStatus).map((r) => r.name)).toEqual(["error", "warning", "disabled", "online"]);
	});

	it("ranks a disabled host as disabled whatever its stored status", () => {
		expect(hostStatusRank(false, { nginxOnline: false })).toBe(hostStatusRank(false, null));
	});
});

const target = (t: Partial<UpstreamHealthTarget>): UpstreamHealthTarget => ({
	locationIndex: null,
	host: "app",
	port: 80,
	ok: false,
	code: "tcp_refused",
	message: "refused",
	...t,
});
const health = (targets: UpstreamHealthTarget[]): UpstreamHostHealth => ({
	checkedAt: "2026-11-04T10:00:00Z",
	ok: false,
	targets,
});

describe("getHostStatus", () => {
	const meta: HostMeta = {
		nginxOnline: true,
		nginxLocations: [
			{ index: 0, path: "/ghost", status: "unresolved", mode: "dynamic", message: null },
			{ index: 1, path: "/bad", status: "quarantined", mode: null, message: null },
			{ index: 2, path: "/fine", status: "ok", mode: "dynamic", message: null },
		],
	};

	it("drops failed health targets of locations that are already reported", () => {
		const status = getHostStatus(
			true,
			meta,
			health([
				target({ locationIndex: 0, path: "/ghost", code: "dns_not_found" }),
				target({ locationIndex: 1, path: "/bad" }),
				target({ locationIndex: 2, path: "/fine" }),
				target({ locationIndex: null }),
			]),
		);
		expect(status.state).toBe("warning");
		expect(status.problemLocations.map((l) => l.path)).toEqual(["/ghost", "/bad"]);
		expect(status.unhealthyTargets.map((t) => t.locationIndex)).toEqual([2, null]);
	});

	it("keeps a target whose path no longer matches the reported location", () => {
		const status = getHostStatus(true, meta, health([target({ locationIndex: 0, path: "/other" })]));
		expect(status.unhealthyTargets).toHaveLength(1);
	});

	it("is online without problems or failed targets", () => {
		expect(getHostStatus(true, { nginxOnline: true }, health([target({ ok: true })])).state).toBe("online");
	});
});

describe("getTestLocationIndex", () => {
	const result = {
		ok: false,
		nginxOnline: true,
		nginxErr: null,
		nginxDetails: null,
		nginxLocations: [
			{ index: 0, path: "/a", status: "ok" as const, mode: "static" as const, message: null },
			{ index: 1, path: "/b", status: "quarantined" as const, mode: null, message: "bad" },
		],
		upstreams: [],
		warnings: [],
	};

	it("points at the location nginx rejected the host for, else the first quarantined one", () => {
		expect(getTestLocationIndex(null)).toBeNull();
		expect(getTestLocationIndex({ ...result, ok: true })).toBeNull();
		expect(getTestLocationIndex(result)).toBe(1);
		expect(
			getTestLocationIndex({
				...result,
				nginxOnline: false,
				nginxDetails: { kind: "nginx_config", scope: "host", locationIndex: 0 },
			}),
		).toBe(0);
		expect(getTestLocationIndex({ ...result, nginxLocations: [] })).toBeNull();
	});
});

describe("isVariableHost", () => {
	it("finds forward hosts with nginx variables like the backend", () => {
		for (const host of ["$backend", " $backend ", "app-$stage", "$svc.internal", "a$x$y"]) {
			expect(isVariableHost(host)).toBe(true);
		}
		expect(isVariableHost(locationHostPart("app-$stage/api"))).toBe(true);
	});

	it("leaves out plain hosts and values that can't be written into nginx config", () => {
		for (const host of ["app", "", null, undefined, "app-$x;", "$x y", "app-$" + "{stage}"]) {
			expect(isVariableHost(host)).toBe(false);
		}
	});
});
