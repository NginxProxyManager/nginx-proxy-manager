import { describe, expect, it } from "vitest";
import { toFormValues, toPayload } from "./trafficStatsForm";

describe("traffic stats settings form", () => {
	it("shows the saved values, as camelized by the API layer", () => {
		const form = toFormValues({
			id: "traffic-stats",
			value: "enabled",
			meta: {
				retentionDays: 60,
				rangeHours: 168,
				geoip: true,
				influx: { url: "http://i:8086", org: "o", bucket: "b", token: "********" },
			},
		});
		expect(form).toMatchObject({
			enabled: true,
			geoip: true,
			retentionDays: 60,
			rangeHours: 168,
			influxUrl: "http://i:8086",
		});
	});

	it("only falls back to the defaults when nothing is saved", () => {
		expect(toFormValues(undefined)).toMatchObject({ enabled: false, retentionDays: 30, rangeHours: 24 });
	});

	it("saves what was shown, and keeps the masked token as is", () => {
		const form = toFormValues({
			id: "traffic-stats",
			value: "enabled",
			meta: { retentionDays: 60, rangeHours: 24, influx: { token: "********" } },
		});
		const payload = toPayload(form);
		expect(payload.value).toBe("enabled");
		expect(payload.meta?.retentionDays).toBe(60);
		expect(payload.meta?.statusCodes).toBe(false);
		expect(payload.meta?.influx.token).toBe("********");
	});
});
