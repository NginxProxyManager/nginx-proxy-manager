/**
 * Per-host nginx access/error log paths under /data/logs (see templates proxy_host.conf, etc.).
 * Migrate stale filenames when the canonical stem from {@link getNginxFileStem} changes.
 *
 * After each successful `internal/nginx.js` `configure()` for a host, stale names are renamed to match the new stem.
 * Optional bulk tool: `scripts/migrate-host-logs.js`.
 */

import fs from "node:fs";
import { join } from "node:path";
import { getNginxFileStem } from "./utils.js";

const DEFAULT_LOG_DIR = "/data/logs";

/** @type {Record<string, string>} */
const LOG_PREFIX_BY_TYPE = {
	proxy_host: "proxy-host",
	redirection_host: "redirection-host",
	dead_host: "dead-host",
	stream: "stream",
};

/**
 * @param   {String} str
 * @returns {String}
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param   {String} nice_host_type
 * @returns {String|null}
 */
const logPrefixForHostType = (nice_host_type) => LOG_PREFIX_BY_TYPE[nice_host_type] ?? null;

/**
 * Active log paths (no rotated suffixes) for a stem.
 *
 * @param   {String} logsDir
 * @param   {String} prefix   e.g. proxy-host
 * @param   {String} stem
 * @returns {{ access: String, error: String }}
 */
const logFilenamesForStem = (logsDir, prefix, stem) => {
	const base = `${prefix}-${stem}`;
	return {
		access: join(logsDir, `${base}_access.log`),
		error: join(logsDir, `${base}_error.log`),
	};
};

/**
 * Canonical active log paths for the current host row (matches nginx templates).
 *
 * @param   {String} logsDir
 * @param   {String} nice_host_type
 * @param   {Object} host
 * @returns {{ access: String, error: String }|null}
 */
const currentLogPaths = (logsDir, nice_host_type, host) => {
	const prefix = logPrefixForHostType(nice_host_type);
	if (!prefix) {
		return null;
	}
	const stem = getNginxFileStem(nice_host_type, host);
	return logFilenamesForStem(logsDir, prefix, stem);
};

/**
 * @param   {String} stem
 * @param   {Number} hostId
 * @returns {Boolean}
 */
const stemBelongsToHostId = (stem, hostId) => {
	const idStr = String(hostId);
	return stem === idStr || stem.startsWith(`${idStr}.`);
};

/**
 * @param   {String} prefix
 * @param   {String} filename  basename only
 * @returns {{ stem: String, kind: String, suffix: String }|null}
 */
const parseHostLogFilename = (prefix, filename) => {
	const re = new RegExp(`^${escapeRegex(prefix)}-(.+)_(access|error)\\.log(.*)$`);
	const m = filename.match(re);
	if (!m) {
		return null;
	}
	return { stem: m[1], kind: m[2], suffix: m[3] ?? "" };
};

/**
 * @param   {String} logsDir
 * @param   {String} prefix
 * @param   {String} stem
 * @param   {String} kind access|error
 * @param   {String} suffix e.g. "" | ".1" | ".2.gz"
 * @returns {String}
 */
const logPathForParts = (logsDir, prefix, stem, kind, suffix) =>
	join(logsDir, `${prefix}-${stem}_${kind}.log${suffix}`);

/**
 * Nginx (or `nginx -t`) may create empty log files at the new paths before we rename; remove only 0-byte files.
 *
 * @param   {String}  dest
 * @param   {Boolean} dryRun
 * @returns {Boolean} true if rename may proceed (no dest, dest removed as empty, or dry-run over empty dest)
 */
const clearEmptyLogPlaceholder = (dest, dryRun) => {
	if (!fs.existsSync(dest)) {
		return true;
	}
	let st;
	try {
		st = fs.statSync(dest);
	} catch {
		return true;
	}
	if (!st.isFile() || st.size !== 0) {
		return false;
	}
	if (!dryRun) {
		fs.unlinkSync(dest);
	}
	return true;
};

/**
 * Max mtime among paths that exist.
 *
 * @param   {String[]} paths
 * @returns {Number}
 */
const maxMtimeMs = (paths) => {
	let max = 0;
	for (const p of paths) {
		try {
			const st = fs.statSync(p);
			const t = st.mtimeMs;
			if (t > max) {
				max = t;
			}
		} catch {
			// ignore missing
		}
	}
	return max;
};

/**
 * List orphan log files for this host (stem ≠ current canonical stem).
 *
 * @param   {String} logsDir
 * @param   {String} nice_host_type
 * @param   {Object} host
 * @returns {{ path: String, stem: String, kind: String, suffix: String }[]}
 */
const listStaleLogFilesForHost = (logsDir, nice_host_type, host) => {
	const prefix = logPrefixForHostType(nice_host_type);
	if (!prefix || !host || typeof host.id === "undefined") {
		return [];
	}
	const currentStem = getNginxFileStem(nice_host_type, host);
	const hostId = host.id;

	let entries;
	try {
		entries = fs.readdirSync(logsDir);
	} catch {
		return [];
	}

	const stale = [];
	for (const name of entries) {
		const parsed = parseHostLogFilename(prefix, name);
		if (!parsed) {
			continue;
		}
		if (!stemBelongsToHostId(parsed.stem, hostId)) {
			continue;
		}
		if (parsed.stem === currentStem) {
			continue;
		}
		stale.push({
			path: join(logsDir, name),
			stem: parsed.stem,
			kind: parsed.kind,
			suffix: parsed.suffix,
		});
	}
	return stale;
};

/**
 * Group stale entries by stem string.
 *
 * @param   {{ path: String, stem: String }[]} entries
 * @returns {Map<String, { path: String, stem: String, kind: String, suffix: String }[]>}
 */
const groupStaleByStem = (entries) => {
	/** @type {Map<string, any[]>} */
	const map = new Map();
	for (const e of entries) {
		const list = map.get(e.stem) ?? [];
		list.push(e);
		map.set(e.stem, list);
	}
	return map;
};

/**
 * @param   {Map<String, { path: String }[]>} stemGroups
 * @returns {String|null} stem with newest max mtime
 */
const newestStaleStemByMtime = (stemGroups) => {
	let bestStem = null;
	let bestMax = -1;
	for (const [stem, files] of stemGroups) {
		const mx = maxMtimeMs(files.map((f) => f.path));
		if (mx > bestMax) {
			bestMax = mx;
			bestStem = stem;
		}
	}
	return bestStem;
};

/**
 * Rename stale per-host logs onto the current canonical stem; multi-stem policy deletes older stems.
 *
 * @param   {String} logsDir
 * @param   {String} nice_host_type
 * @param   {Object} host
 * @param   {{ dryRun?: Boolean }} [options]
 * @returns {{
 *   dryRun: Boolean,
 *   deleted: String[],
 *   renamed: { from: String, to: String }[],
 *   skipped: { from: String, to: String, reason: String }[],
 * }}
 */
const renameStaleLogsToCurrent = (logsDir, nice_host_type, host, options = {}) => {
	const dryRun = Boolean(options.dryRun);
	const prefix = logPrefixForHostType(nice_host_type);
	const deleted = [];
	const renamed = [];
	const skipped = [];

	if (!prefix || !host || typeof host.id === "undefined") {
		return { dryRun, deleted, renamed, skipped };
	}

	const currentStem = getNginxFileStem(nice_host_type, host);
	const staleEntries = listStaleLogFilesForHost(logsDir, nice_host_type, host);
	if (!staleEntries.length) {
		return { dryRun, deleted, renamed, skipped };
	}

	const stemGroups = groupStaleByStem(staleEntries);
	const stems = [...stemGroups.keys()];

	if (stems.length === 1) {
		const onlyStem = stems[0];
		for (const entry of stemGroups.get(onlyStem)) {
			const dest = logPathForParts(logsDir, prefix, currentStem, entry.kind, entry.suffix);
			if (entry.path === dest) {
				continue;
			}
			try {
				if (fs.existsSync(dest) && !clearEmptyLogPlaceholder(dest, dryRun)) {
					skipped.push({ from: entry.path, to: dest, reason: "target_exists_nonempty" });
					continue;
				}
				if (!dryRun) {
					fs.renameSync(entry.path, dest);
				}
				renamed.push({ from: entry.path, to: dest });
			} catch (err) {
				skipped.push({ from: entry.path, to: dest, reason: err instanceof Error ? err.message : String(err) });
			}
		}
		return { dryRun, deleted, renamed, skipped };
	}

	const newestStem = newestStaleStemByMtime(stemGroups);
	for (const stem of stems) {
		if (stem === newestStem) {
			continue;
		}
		for (const entry of stemGroups.get(stem)) {
			try {
				if (!dryRun && fs.existsSync(entry.path)) {
					fs.unlinkSync(entry.path);
				}
				deleted.push(entry.path);
			} catch (err) {
				skipped.push({
					from: entry.path,
					to: "",
					reason: `delete:${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}
	}

	for (const entry of stemGroups.get(newestStem)) {
		const dest = logPathForParts(logsDir, prefix, currentStem, entry.kind, entry.suffix);
		if (entry.path === dest) {
			continue;
		}
		try {
			if (fs.existsSync(dest) && !clearEmptyLogPlaceholder(dest, dryRun)) {
				skipped.push({ from: entry.path, to: dest, reason: "target_exists_nonempty" });
				continue;
			}
			if (!dryRun) {
				fs.renameSync(entry.path, dest);
			}
			renamed.push({ from: entry.path, to: dest });
		} catch (err) {
			skipped.push({ from: entry.path, to: dest, reason: err instanceof Error ? err.message : String(err) });
		}
	}

	return { dryRun, deleted, renamed, skipped };
};

export {
	LOG_PREFIX_BY_TYPE,
	DEFAULT_LOG_DIR,
	logPrefixForHostType,
	logFilenamesForStem,
	currentLogPaths,
	stemBelongsToHostId,
	parseHostLogFilename,
	listStaleLogFilesForHost,
	renameStaleLogsToCurrent,
};
