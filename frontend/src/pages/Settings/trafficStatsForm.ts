import type { Setting } from "src/api/backend";

// Note: the API layer camelizes response keys, so the saved meta comes back as
// retentionDays / rangeHours even though the backend stores retention_days / range_hours.
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_RANGE_HOURS = 24;

export interface TrafficStatsForm {
	enabled: boolean;
	geoip: boolean;
	statusCodes: boolean;
	retentionDays: number;
	rangeHours: number;
	influxUrl: string;
	influxOrg: string;
	influxBucket: string;
	influxToken: string;
}

export const toFormValues = (data?: Setting): TrafficStatsForm => {
	const meta = data?.meta || {};
	const influx = meta.influx || {};
	return {
		enabled: data?.value === "enabled",
		geoip: meta.geoip === true,
		statusCodes: meta.statusCodes === true,
		retentionDays: meta.retentionDays ?? DEFAULT_RETENTION_DAYS,
		rangeHours: meta.rangeHours ?? DEFAULT_RANGE_HOURS,
		influxUrl: influx.url || "",
		influxOrg: influx.org || "",
		influxBucket: influx.bucket || "",
		influxToken: influx.token || "",
	};
};

export const toPayload = (values: TrafficStatsForm): Setting => ({
	id: "traffic-stats",
	value: values.enabled ? "enabled" : "disabled",
	meta: {
		geoip: !!values.geoip,
		statusCodes: !!values.statusCodes,
		retentionDays: Number(values.retentionDays),
		rangeHours: Number(values.rangeHours),
		influx: {
			url: values.influxUrl.trim(),
			org: values.influxOrg.trim(),
			bucket: values.influxBucket.trim(),
			token: values.influxToken,
		},
	},
});
