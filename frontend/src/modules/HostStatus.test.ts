import type { HostMeta, UpstreamHealthTarget, UpstreamHostHealth } from "src/api/backend";
import { describe, expect, it } from "vitest";
import { getHostStatus } from "./HostStatus";

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
