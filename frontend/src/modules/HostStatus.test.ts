import type { HostMeta } from "src/api/backend";
import { describe, expect, it } from "vitest";
import { hostStatusRank, sortByHostStatus } from "./HostStatus";

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

	it("ranks a disabled host as disabled whatever its stored status", () => {
		expect(hostStatusRank(false, { nginxOnline: false })).toBe(hostStatusRank(false, null));
	});
});
