import { BUCKET_SECONDS } from "../aggregator.js";

const FIELDS = ["requests", "s2xx", "s3xx", "s4xx", "s5xx", "bytes"];
const MEASUREMENT = "npm_traffic";
const STATUS_MEASUREMENT = "npm_traffic_status";
const TIMEOUT_MS = 15000;

// Nanosecond timestamps are far beyond what a JS number holds exactly, so build them as BigInts.
const stamp = (bucket, offset) => (BigInt(bucket) * 1000000000n + BigInt(offset)).toString();
const escapeTag = (v) => String(v).replace(/[,= ]/g, "\\$&");
const escapeFlux = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const num = (v) => Number(v) || 0;

// A point written for a host and bucket gets a nanosecond offset inside the bucket that comes from
// where in the log file the batch started. InfluxDB overwrites a point with an identical series and
// timestamp, so:
//  - successive batches (different start positions) add up instead of replacing each other,
//  - a batch that is written again after a failure (same start, possibly with more lines) replaces
//    the first attempt instead of counting twice,
//  - imported history (offset 0) can be imported again without counting twice.
const offsetFor = (opts) => (opts.backfill ? 0 : ((Number(opts.key) || 0) % 999999999) + 1);

/**
 * Splits InfluxDB annotated CSV into row objects (one table per header block).
 */
const parseCsv = (text) => {
	const rows = [];
	let header = null;
	for (const line of text.split(/\r?\n/)) {
		if (!line) {
			header = null;
			continue;
		}
		if (line.startsWith("#")) {
			continue;
		}
		const cells = line.split(",");
		if (!header) {
			header = cells;
			continue;
		}
		const row = {};
		header.forEach((name, i) => {
			if (name) {
				row[name] = cells[i];
			}
		});
		rows.push(row);
	}
	return rows;
};

/**
 * Stores the traffic counters in InfluxDB 2.x, so they can be graphed in Grafana.
 *
 * @param {{url: String, org: String, bucket: String, token: String}} cfg
 * @param {(host_type: String, host_id: Number) => String} labelOf
 */
const influxStore = (cfg, labelOf = () => "") => {
	const base = cfg.url.replace(/\/+$/, "");
	const headers = { Authorization: `Token ${cfg.token}` };

	const call = async (path, options = {}) => {
		const res = await fetch(`${base}${path}`, {
			...options,
			headers: { ...headers, ...(options.headers || {}) },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) {
			const body = (await res.text()).slice(0, 200);
			throw new Error(`InfluxDB responded ${res.status}: ${body}`);
		}
		return res;
	};

	const flux = async (query) => {
		const res = await call(`/api/v2/query?org=${encodeURIComponent(cfg.org)}`, {
			method: "POST",
			headers: { "Content-Type": "application/vnd.flux", Accept: "application/csv" },
			body: query,
		});
		return parseCsv(await res.text());
	};

	// `hosts` is a list of {host_type, host_id}; an entry without host_id means every host of that type
	const scopeFilter = (hosts) => {
		if (!hosts) {
			return "";
		}
		const parts = hosts.map((h) =>
			h.host_id === undefined || h.host_id === null
				? `r.host_type == "${escapeFlux(h.host_type)}"`
				: `(r.host_type == "${escapeFlux(h.host_type)}" and r.host_id == "${Number(h.host_id)}")`,
		);
		return `|> filter(fn: (r) => ${parts.join(" or ")})`;
	};

	// Windows start at the (grid aligned) start of the range and are stamped with their start time,
	// so every point lands on the same grid the dashboard draws.
	const alignedRange = (from, to, win) => `|> range(start: ${from - (from % win)}, stop: ${to})`;

	return {
		type: "influxdb",
		savesCursor: false,

		async ping() {
			await call("/health");
			await flux(`from(bucket: "${escapeFlux(cfg.bucket)}") |> range(start: -1m) |> limit(n: 1)`);
		},

		async write(batch, opts = {}) {
			const hostTags = (b) =>
				`host_type=${escapeTag(b.host_type)},host_id=${b.host_id},host=${escapeTag(labelOf(b.host_type, b.host_id) || `host-${b.host_id}`)}`;
			const offset = offsetFor(opts);
			const lines = batch.buckets.map((b) => {
				const fields = FIELDS.map((f) => `${f}=${b[f]}i`).join(",");
				return `${MEASUREMENT},${hostTags(b)} ${fields} ${stamp(b.bucket, offset)}`;
			});
			// Exact status codes (only present when that extra is on): one small series per host and code
			for (const t of batch.tops) {
				if (t.kind === "status") {
					lines.push(
						`${STATUS_MEASUREMENT},${hostTags(t)},code=${escapeTag(t.item)} hits=${t.hits}i ${stamp(t.bucket, offset)}`,
					);
				}
			}
			for (let i = 0; i < lines.length; i += 5000) {
				await call(
					`/api/v2/write?org=${encodeURIComponent(cfg.org)}&bucket=${encodeURIComponent(cfg.bucket)}&precision=ns`,
					{
						method: "POST",
						headers: { "Content-Type": "text/plain; charset=utf-8" },
						body: lines.slice(i, i + 5000).join("\n"),
					},
				);
			}
		},

		// Retention is enforced by the InfluxDB bucket itself.
		async prune() {},
		async clear() {},

		/**
		 * Deletes what was written for one host from `since` (epoch seconds) on, before its log is
		 * imported again, so an earlier import and earlier live points can't add up with the new
		 * import. Older points, which the logs can't rebuild, are left alone.
		 */
		async clearHost(host_type, host_id, since = 0) {
			for (const measurement of [MEASUREMENT, STATUS_MEASUREMENT]) {
				await call(
					`/api/v2/delete?org=${encodeURIComponent(cfg.org)}&bucket=${encodeURIComponent(cfg.bucket)}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							start: new Date(since * 1000).toISOString(),
							stop: new Date(Date.now() + 86400000).toISOString(),
							predicate: `_measurement="${measurement}" AND host_type="${escapeFlux(host_type)}" AND host_id="${Number(host_id)}"`,
						}),
					},
				);
			}
		},

		async query({ from, to, step, statusStep, hosts, statuses: wantStatuses = false }) {
			if (hosts && hosts.length === 0) {
				return { series: [], hosts: [], statuses: [], top: { ip: [], path: [], country: [] } };
			}
			const win = Math.max(BUCKET_SECONDS, step);
			const common = (range) => `from(bucket: "${escapeFlux(cfg.bucket)}")
				${range}
				|> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
				${scopeFilter(hosts)}`;

			const seriesRows = await flux(`${common(alignedRange(from, to, win))}
				|> group(columns: ["_field"])
				|> aggregateWindow(every: ${win}s, fn: sum, createEmpty: false, timeSrc: "_start")`);
			const byTs = new Map();
			for (const r of seriesRows) {
				const ts = Math.floor(Date.parse(r._time) / 1000);
				const row = byTs.get(ts) || { ts, requests: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, bytes: 0 };
				if (FIELDS.includes(r._field)) {
					row[r._field] = num(r._value);
				}
				byTs.set(ts, row);
			}

			const hostRows = await flux(`${common(`|> range(start: ${from}, stop: ${to})`)}
				|> group(columns: ["host_type", "host_id", "_field"])
				|> sum()`);
			const byHost = new Map();
			for (const r of hostRows) {
				const key = `${r.host_type}|${r.host_id}`;
				const row = byHost.get(key) || {
					host_type: r.host_type,
					host_id: Number(r.host_id),
					requests: 0,
					s2xx: 0,
					s3xx: 0,
					s4xx: 0,
					s5xx: 0,
					bytes: 0,
				};
				if (FIELDS.includes(r._field)) {
					row[r._field] = num(r._value);
				}
				byHost.set(key, row);
			}

			const statuses = [];
			if (wantStatuses) {
				// the code points are hourly, so their windows are never narrower than that
				const statusWin = Math.max(3600, statusStep || win);
				const statusRows = await flux(`from(bucket: "${escapeFlux(cfg.bucket)}")
					${alignedRange(from, to, statusWin)}
					|> filter(fn: (r) => r._measurement == "${STATUS_MEASUREMENT}" and r._field == "hits")
					${scopeFilter(hosts)}
					|> group(columns: ["code"])
					|> aggregateWindow(every: ${statusWin}s, fn: sum, createEmpty: false, timeSrc: "_start")`);
				const byCode = new Map();
				for (const r of statusRows) {
					const entry = byCode.get(r.code) || { code: Number(r.code), total: 0, series: [] };
					const hits = num(r._value);
					entry.total += hits;
					entry.series.push({ ts: Math.floor(Date.parse(r._time) / 1000), requests: hits });
					byCode.set(r.code, entry);
				}
				statuses.push(...[...byCode.values()].sort((a, b) => b.total - a.total));
			}

			return {
				series: [...byTs.values()].sort((a, b) => a.ts - b.ts),
				hosts: [...byHost.values()],
				statuses,
				// Client IPs, paths and countries are not exported: as InfluxDB tags they'd create unbounded series.
				top: { ip: [], path: [], country: [] },
			};
		},
	};
};

export default influxStore;
