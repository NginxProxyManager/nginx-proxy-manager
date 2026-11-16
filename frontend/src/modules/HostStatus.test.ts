import type { HostMeta } from "src/api/backend";
import { describe, expect, it } from "vitest";
import { hostStatusRank, isVariableHost, locationHostPart, sortByHostStatus } from "./HostStatus";

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
