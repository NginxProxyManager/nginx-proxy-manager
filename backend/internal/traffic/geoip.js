import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import maxmind from "maxmind";
import { global as logger } from "../../logger.js";

const GEOIP_DIR = process.env.NPM_TRAFFIC_GEOIP_DIR || "/data/geoip";
const AUTO_FILE = "dbip-country-lite.mmdb";
const MAX_AGE_MS = 35 * 24 * 3600 * 1000;
const CACHE_MAX = 50000;

// Any .mmdb a user drops into GEOIP_DIR is used as is (and never replaced). Otherwise the
// free DB-IP country database (CC BY 4.0, https://db-ip.com) is downloaded and refreshed monthly.
const downloadUrl = (date) =>
	`https://download.db-ip.com/free/dbip-country-lite-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}.mmdb.gz`;

class GeoIp {
	constructor() {
		this.reader = null;
		this.file = null;
		this.cache = new Map();
		this.error = null;
	}

	#userFile() {
		try {
			const found = fs.readdirSync(GEOIP_DIR).find((f) => f.endsWith(".mmdb") && f !== AUTO_FILE);
			return found ? path.join(GEOIP_DIR, found) : null;
		} catch {
			return null;
		}
	}

	async #download() {
		const target = path.join(GEOIP_DIR, AUTO_FILE);
		await fs.promises.mkdir(GEOIP_DIR, { recursive: true });
		const now = new Date();
		// early in a month the new file may not be published yet, so fall back to last month's
		const candidates = [now, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))];
		let lastErr = null;
		for (const date of candidates) {
			const res = await fetch(downloadUrl(date), { signal: AbortSignal.timeout(120000) });
			if (!res.ok) {
				lastErr = new Error(`DB-IP download responded ${res.status}`);
				continue;
			}
			const tmp = `${target}.tmp`;
			await pipeline(Readable.fromWeb(res.body), zlib.createGunzip(), fs.createWriteStream(tmp));
			await fs.promises.rename(tmp, target);
			logger.info(`Traffic stats: downloaded GeoIP database for ${date.toISOString().slice(0, 7)}`);
			return target;
		}
		throw lastErr || new Error("DB-IP download failed");
	}

	/**
	 * Makes sure a database is loaded, downloading or refreshing it if needed.
	 */
	async ensure() {
		try {
			let file = this.#userFile();
			if (!file) {
				file = path.join(GEOIP_DIR, AUTO_FILE);
				let age = Number.POSITIVE_INFINITY;
				try {
					age = Date.now() - (await fs.promises.stat(file)).mtimeMs;
				} catch {
					// not downloaded yet
				}
				if (age > MAX_AGE_MS) {
					try {
						await this.#download();
					} catch (err) {
						if (age === Number.POSITIVE_INFINITY) {
							throw err;
						}
						logger.warn(`Traffic stats: GeoIP refresh failed, keeping the old database: ${err.message}`);
					}
				}
			}
			if (!this.reader || this.file !== file) {
				this.reader = await maxmind.open(file);
				this.file = file;
				this.cache.clear();
			}
			this.error = null;
		} catch (err) {
			this.error = `GeoIP unavailable: ${err.message}`;
			logger.warn(`Traffic stats: ${this.error}`);
		}
	}

	unload() {
		this.reader = null;
		this.file = null;
		this.cache.clear();
		this.error = null;
	}

	/**
	 * @param   {String} ip
	 * @returns {String|null} ISO 3166 country code, or null if unknown
	 */
	country(ip) {
		if (!this.reader) {
			return null;
		}
		if (this.cache.has(ip)) {
			return this.cache.get(ip);
		}
		let code = null;
		try {
			code = this.reader.get(ip)?.country?.iso_code || null;
		} catch {
			// not a valid address
		}
		if (this.cache.size >= CACHE_MAX) {
			this.cache.clear();
		}
		this.cache.set(ip, code);
		return code;
	}
}

export default GeoIp;
