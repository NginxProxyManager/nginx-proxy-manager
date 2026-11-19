export const BUCKET_SECONDS = 300;
export const TOP_BUCKET_SECONDS = 3600;
// Only client IPs and paths are cut down to their busiest items. Countries and status codes are
// complete breakdowns with a small natural limit, so every entry is kept.
export const LIMITED_KINDS = ["ip", "path"];
export const TOP_KEEP = 25;
const ITEM_MAX = 255;

/**
 * Accumulates parsed log records in memory until they're flushed to a store.
 */
class Aggregator {
	/**
	 * @param {Object}  [opts]
	 * @param {Boolean} [opts.statusCodes]  also count each exact status code (hourly)
	 */
	constructor({ statusCodes = false } = {}) {
		this.statusCodes = statusCodes;
		this.reset();
	}

	reset() {
		this.buckets = new Map();
		this.tops = new Map();
	}

	/**
	 * @param {{host_type: String, host_id: Number}} host
	 * @param {Object} rec  result of parseLine()
	 */
	add(host, rec) {
		const bucket = rec.ts - (rec.ts % BUCKET_SECONDS);
		const key = `${bucket}|${host.host_type}|${host.host_id}`;
		let row = this.buckets.get(key);
		if (!row) {
			row = {
				bucket,
				host_type: host.host_type,
				host_id: host.host_id,
				requests: 0,
				s2xx: 0,
				s3xx: 0,
				s4xx: 0,
				s5xx: 0,
				bytes: 0,
			};
			this.buckets.set(key, row);
		}
		row.requests++;
		row.bytes += rec.bytes;
		const cls = Math.floor(rec.status / 100);
		if (cls >= 2 && cls <= 5) {
			row[`s${cls}xx`]++;
		}

		const topBucket = rec.ts - (rec.ts % TOP_BUCKET_SECONDS);
		this.#top(topBucket, host, "ip", rec.ip);
		if (rec.path) {
			this.#top(topBucket, host, "path", rec.path);
		}
		if (this.statusCodes && rec.status) {
			this.#top(topBucket, host, "status", String(rec.status));
		}
		if (rec.country) {
			this.#top(topBucket, host, "country", rec.country);
		}
	}

	#top(bucket, host, kind, item) {
		const groupKey = `${bucket}|${host.host_type}|${host.host_id}|${kind}`;
		let group = this.tops.get(groupKey);
		if (!group) {
			group = { bucket, host_type: host.host_type, host_id: host.host_id, kind, items: new Map() };
			this.tops.set(groupKey, group);
		}
		const name = item.length > ITEM_MAX ? item.slice(0, ITEM_MAX) : item;
		group.items.set(name, (group.items.get(name) || 0) + 1);
	}

	get size() {
		return this.buckets.size;
	}

	#collect(buckets, groups) {
		const tops = [];
		for (const group of groups) {
			let entries = [...group.items.entries()].sort((a, b) => b[1] - a[1]);
			if (LIMITED_KINDS.includes(group.kind)) {
				entries = entries.slice(0, TOP_KEEP);
			}
			for (const [item, hits] of entries) {
				tops.push({
					bucket: group.bucket,
					host_type: group.host_type,
					host_id: group.host_id,
					kind: group.kind,
					item,
					hits,
				});
			}
		}
		return { buckets, tops };
	}

	/**
	 * Returns what has been accumulated and resets.
	 *
	 * @returns {{buckets: Object[], tops: Object[]}}
	 */
	drain() {
		const result = this.#collect([...this.buckets.values()], [...this.tops.values()]);
		this.reset();
		return result;
	}

	/**
	 * Returns and removes only the buckets that end before `ts`, so a long import can be
	 * written in bounded batches while the newer, still growing buckets stay in memory.
	 *
	 * @param   {Number} ts  unix seconds
	 * @returns {{buckets: Object[], tops: Object[]}}
	 */
	drainBefore(ts) {
		const buckets = [];
		for (const [key, row] of this.buckets) {
			if (row.bucket + BUCKET_SECONDS <= ts) {
				buckets.push(row);
				this.buckets.delete(key);
			}
		}
		const groups = [];
		for (const [key, group] of this.tops) {
			if (group.bucket + TOP_BUCKET_SECONDS <= ts) {
				groups.push(group);
				this.tops.delete(key);
			}
		}
		return this.#collect(buckets, groups);
	}
}

export default Aggregator;
