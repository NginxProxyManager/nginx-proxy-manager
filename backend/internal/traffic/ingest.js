import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import db from "../../db.js";
import { global as logger } from "../../logger.js";
import Aggregator from "./aggregator.js";
import { isLocalIp } from "./ip.js";
import { parseFileName, parseLine } from "./parser.js";

const LOG_DIR = process.env.NPM_TRAFFIC_LOG_DIR || "/data/logs";
const POLL_MS = 10 * 1000;
const MAX_READ_PER_TICK = 16 * 1024 * 1024;
// While importing history, buckets that are over are written out every this many lines, so memory
// stays bounded no matter how big the logs are
const BACKFILL_FLUSH_LINES = 100000;
const BACKFILL_LAG_SECONDS = 2 * 3600;

class Stopped extends Error {}

/**
 * Tails the per-host nginx access logs and feeds the parsed lines to a store.
 *
 * The first time a log file is seen, every existing line (including rotated
 * files) inside the retention window is imported. After that only new bytes
 * are read, tracked by a cursor (inode + byte position) kept in the database.
 */
// The cursor's inode column also carries a generation ("<inode>:<n>") that goes up every time the
// file is rotated or truncated. It is part of a batch's identity in remote stores, so a new file
// can't reuse the identity of a batch that was written for an earlier one.
const GENERATION_STRIDE = 400000009;
const splitInode = (value) => {
	const [ino, gen] = String(value).split(":");
	return { ino, gen: Number(gen) || 0 };
};
const joinInode = (ino, gen) => `${ino}:${gen}`;

class Ingest {
	/**
	 * @param {Object}   opts
	 * @param {Object}   opts.store          one of the traffic stores
	 * @param {Number}   opts.retentionDays  lines older than this are skipped
	 * @param {Object}   [opts.geoip]        a GeoIp instance, to add countries
	 * @param {Boolean}  [opts.statusCodes]  also count each exact status code
	 */
	constructor({ store, retentionDays, geoip = null, statusCodes = false }) {
		this.statusCodes = statusCodes;
		this.store = store;
		this.retentionDays = retentionDays;
		this.geoip = geoip;
		this.lastGeoip = 0;
		this.timer = null;
		this.running = null;
		this.stopped = false;
		this.lastPrune = 0;
		this.lastError = null;
		this.lastRun = null;
	}

	start() {
		if (this.timer || this.stopped) {
			return;
		}
		this.timer = setInterval(() => this.tick(), POLL_MS);
		this.timer.unref?.();
		this.tick();
	}

	/**
	 * Stops the worker and waits for a pass that is already running to finish, so a replacement
	 * worker never works on the same files and cursors at the same time.
	 */
	async stop() {
		this.stopped = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		await this.running;
	}

	get #cutoff() {
		return Math.floor(Date.now() / 1000) - this.retentionDays * 86400;
	}

	#checkStopped() {
		if (this.stopped) {
			throw new Stopped();
		}
	}

	tick() {
		if (this.running || this.stopped) {
			return this.running;
		}
		this.running = this.#tick().finally(() => {
			this.running = null;
		});
		return this.running;
	}

	async #tick() {
		try {
			if (this.geoip && Date.now() - this.lastGeoip > 3600 * 1000) {
				this.lastGeoip = Date.now();
				await this.geoip.ensure();
			}
			const files = (await fs.promises.readdir(LOG_DIR)).filter((f) => parseFileName(f));
			const cursors = new Map((await db()("traffic_stat_cursor").select()).map((c) => [c.file, c]));

			for (const file of files) {
				this.#checkStopped();
				await this.#processFile(file, cursors.get(file));
			}

			// Forget cursors for log files that no longer exist (deleted hosts)
			const gone = [...cursors.keys()].filter((f) => !files.includes(f));
			if (gone.length) {
				await db()("traffic_stat_cursor").whereIn("file", gone).del();
			}

			if (Date.now() - this.lastPrune > 3600 * 1000) {
				this.lastPrune = Date.now();
				await this.store.prune(this.#cutoff);
			}
			this.lastError = null;
		} catch (err) {
			if (!(err instanceof Stopped)) {
				this.lastError = err.message;
				logger.error(`Traffic stats ingest failed: ${err.message}`);
			}
		} finally {
			this.lastRun = Date.now();
		}
	}

	#parse(line, host) {
		const rec = parseLine(line, host.host_type);
		if (rec && this.geoip?.reader) {
			rec.country = isLocalIp(rec.ip) ? "LOCAL" : this.geoip.country(rec.ip) || "??";
		}
		return rec;
	}

	#addLines(text, host, agg) {
		const cutoff = this.#cutoff;
		for (const line of text.split("\n")) {
			const rec = this.#parse(line, host);
			if (rec && rec.ts >= cutoff) {
				agg.add(host, rec);
			}
		}
	}

	async #saveCursor(file, inode, position) {
		await db()("traffic_stat_cursor")
			.insert({ file, inode: String(inode), position })
			.onConflict("file")
			.merge({ inode: String(inode), position });
	}

	/**
	 * Writes a batch and moves the cursor. The local store does both in one transaction. For a
	 * remote store the write can't be atomic with the cursor, so it is made safe to repeat instead:
	 * a batch that is written again after a failure replaces its first attempt (see the offset
	 * scheme in the InfluxDB store).
	 */
	async #commit(batch, { file, inode, position, key, backfill = false }) {
		const hasData = batch.buckets.length > 0 || batch.tops.length > 0;
		if (this.store.savesCursor) {
			await this.store.write(batch, { backfill, key, cursor: { file, inode, position } });
			return;
		}
		if (hasData) {
			await this.store.write(batch, { backfill, key });
		}
		await this.#saveCursor(file, inode, position);
	}

	async #processFile(file, cursor) {
		const full = path.join(LOG_DIR, file);
		const host = parseFileName(file);
		let stat;
		try {
			stat = await fs.promises.stat(full);
		} catch {
			return;
		}

		if (!cursor) {
			await this.#backfill(file, host, stat);
			return;
		}

		const agg = new Aggregator({ statusCodes: this.statusCodes });
		const savedPosition = Number(cursor.position);
		let position = savedPosition;
		const saved = splitInode(cursor.inode);
		const rotated = String(stat.ino) !== saved.ino || stat.size < position;

		if (rotated) {
			await this.#recoverRotated(full, saved.ino, savedPosition, host, agg);
			position = 0;
		}

		const end = Math.min(stat.size, position + MAX_READ_PER_TICK);
		const consumed = end > position ? await this.#readRange(full, position, end, host, agg) : 0;

		if (rotated || consumed > 0 || agg.size > 0) {
			this.#checkStopped();
			await this.#commit(agg.drain(), {
				file,
				inode: joinInode(stat.ino, rotated ? saved.gen + 1 : saved.gen),
				position: position + consumed,
				// batches are keyed by file generation and start position, which is what makes a
				// repeat of one safe (a repeat after a failure starts from the same cursor)
				key: saved.gen * GENERATION_STRIDE + (rotated ? savedPosition : position),
			});
		}
	}

	/**
	 * After a rotation, picks up what was written to the old file between our last read and the rotation.
	 * logrotate's `compress` (without `delaycompress`) turns the old file into .1.gz straight away,
	 * otherwise it stays as .1 with the same inode.
	 */
	async #recoverRotated(full, inode, position, host, agg) {
		try {
			const plain = await fs.promises.stat(`${full}.1`);
			if (String(plain.ino) === inode) {
				if (plain.size > position) {
					await this.#readRange(`${full}.1`, position, plain.size, host, agg);
				}
				return;
			}
		} catch {
			// no uncompressed copy
		}
		try {
			await fs.promises.stat(`${full}.1.gz`);
		} catch {
			return;
		}
		try {
			await this.#readGzTail(`${full}.1.gz`, position, host, agg);
		} catch (err) {
			logger.warn(`Traffic stats: could not recover the end of ${path.basename(full)}.1.gz: ${err.message}`);
		}
	}

	/**
	 * Reads the lines of a compressed file that come after the first `skip` bytes. Nothing is
	 * counted unless `skip` is on a line boundary, which guards against it being a different file.
	 */
	async #readGzTail(file, skip, host, agg) {
		let seen = 0;
		let lastSkipped = null;
		let started = skip === 0;
		let carry = "";
		const input = fs.createReadStream(file).pipe(zlib.createGunzip());
		for await (const chunk of input) {
			let data = chunk;
			if (!started) {
				const need = skip - seen;
				if (data.length < need) {
					seen += data.length;
					continue;
				}
				lastSkipped = data[need - 1];
				if (lastSkipped !== 0x0a) {
					return;
				}
				data = data.subarray(need);
				started = true;
			}
			carry += data.toString("utf8");
			const lastNewline = carry.lastIndexOf("\n");
			if (lastNewline >= 0) {
				this.#addLines(carry.slice(0, lastNewline), host, agg);
				carry = carry.slice(lastNewline + 1);
			}
		}
	}

	/**
	 * Reads whole lines in [start, end). Returns the bytes consumed, which stops
	 * short of `end` if the last line isn't finished yet.
	 */
	async #readRange(filePath, start, end, host, agg) {
		const handle = await fs.promises.open(filePath, "r");
		try {
			const length = end - start;
			const buf = Buffer.alloc(length);
			const { bytesRead } = await handle.read(buf, 0, length, start);
			const lastNewline = buf.lastIndexOf(0x0a, bytesRead - 1);
			if (lastNewline < 0) {
				return 0;
			}
			this.#addLines(buf.toString("utf8", 0, lastNewline), host, agg);
			return lastNewline + 1;
		} finally {
			await handle.close();
		}
	}

	async #streamLines(filePath, options, onLine) {
		let input = fs.createReadStream(filePath, options);
		if (filePath.endsWith(".gz")) {
			input = input.pipe(zlib.createGunzip());
		}
		const rl = readline.createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
		for await (const line of rl) {
			await onLine(line);
		}
	}

	/**
	 * Timestamp of the oldest line in a host's logs (the oldest rotated file, else the live one),
	 * or null if there is none.
	 */
	async #firstTimestamp(file) {
		const dir = await fs.promises.readdir(LOG_DIR);
		const rotated = dir
			.filter((f) => f.startsWith(`${file}.`))
			.map((f) => ({ name: f, n: Number.parseInt(f.slice(file.length + 1), 10) }))
			.filter((f) => Number.isFinite(f.n))
			.sort((a, b) => b.n - a.n)
			.map((f) => f.name);
		const host = parseFileName(file);
		const found = Symbol("found");
		for (const name of [...rotated, file]) {
			let ts = null;
			try {
				await this.#streamLines(path.join(LOG_DIR, name), {}, (line) => {
					const rec = this.#parse(line, host);
					if (rec) {
						ts = rec.ts;
						throw found;
					}
				});
			} catch (err) {
				if (err !== found) {
					continue;
				}
			}
			if (ts !== null) {
				return ts;
			}
		}
		return null;
	}

	/**
	 * Byte length of the file up to and including its last newline.
	 */
	async #completeLength(filePath, size) {
		const handle = await fs.promises.open(filePath, "r");
		try {
			let end = size;
			while (end > 0) {
				const len = Math.min(64 * 1024, end);
				const buf = Buffer.alloc(len);
				await handle.read(buf, 0, len, end - len);
				const idx = buf.lastIndexOf(0x0a);
				if (idx >= 0) {
					return end - len + idx + 1;
				}
				end -= len;
			}
			return 0;
		} finally {
			await handle.close();
		}
	}

	/**
	 * First sight of a host's log: import rotated files (oldest first), then the live file up to its
	 * current size, and park the cursor there.
	 *
	 * Whatever was recorded for the host before is deleted first, so an import that was interrupted,
	 * or a repeat after switching storage, can't count anything twice. The import is written in
	 * bounded batches of buckets that are over, and the cursor only moves with the last one.
	 */
	async #backfill(file, host, stat) {
		const full = path.join(LOG_DIR, file);
		// Only the period the logs still cover is replaced; older history in the store is kept.
		const cutoff = this.#cutoff;
		try {
			const first = await this.#firstTimestamp(file);
			if (first !== null) {
				await this.store.clearHost(
					host.host_type,
					host.host_id,
					Math.floor(Math.max(first, cutoff) / 3600) * 3600,
				);
			}
		} catch (err) {
			logger.warn(
				`Traffic stats: could not clear old statistics of ${file}, they may be counted twice: ${err.message}`,
			);
		}

		const agg = new Aggregator({ statusCodes: this.statusCodes });
		let newest = 0;
		let lines = 0;
		const onLine = async (line) => {
			const rec = this.#parse(line, host);
			if (rec && rec.ts >= cutoff) {
				agg.add(host, rec);
				newest = Math.max(newest, rec.ts);
			}
			if (++lines % BACKFILL_FLUSH_LINES === 0) {
				this.#checkStopped();
				const batch = agg.drainBefore(newest - BACKFILL_LAG_SECONDS);
				if (batch.buckets.length > 0 || batch.tops.length > 0) {
					try {
						await this.store.write(batch, { backfill: true });
					} catch (err) {
						// These counts are already out of memory: the import has to stop, and the
						// cursor must not move, so the next pass imports this host again.
						err.writeFailed = true;
						throw err;
					}
				}
			}
		};

		const rotated = (await fs.promises.readdir(LOG_DIR))
			.filter((f) => f.startsWith(`${file}.`))
			.map((f) => ({ name: f, n: Number.parseInt(f.slice(file.length + 1), 10) }))
			.filter((f) => Number.isFinite(f.n))
			.sort((a, b) => b.n - a.n);

		for (const r of rotated) {
			try {
				await this.#streamLines(path.join(LOG_DIR, r.name), {}, onLine);
			} catch (err) {
				if (err instanceof Stopped || err.writeFailed) {
					throw err;
				}
				logger.warn(`Traffic stats: could not import ${r.name}: ${err.message}`);
			}
		}

		// Only count complete lines and remember exactly where we stopped
		const consumed = await this.#completeLength(full, stat.size);
		if (consumed > 0) {
			await this.#streamLines(full, { start: 0, end: consumed - 1 }, onLine);
		}

		this.#checkStopped();
		await this.#commit(agg.drain(), { file, inode: joinInode(stat.ino, 0), position: consumed, backfill: true });
		logger.info(`Traffic stats: imported existing log ${file}`);
	}
}

export default Ingest;
