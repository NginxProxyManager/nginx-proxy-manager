/**
 * `nginx -s reload` only signals the master process and returns at once. The master then reads the config
 * files asynchronously. If the lock (see lib/nginx-lock.js) is released at that point, the next holder may
 * already write a candidate file that nginx rejects: the master reads that file, the reload fails and the
 * change that was saved before is never applied, although it was tested and stored.
 *
 * reloadAndWait() therefore signals the master and waits until the reload has really happened: the master
 * starts a new generation of worker processes once it has read and applied the new config. The workers are
 * the master's children in /proc. When the master can't be found (eg. nginx is not running yet) or no new
 * workers show up in time, the result says the reload is not confirmed and the caller decides what to do.
 * After that it also waits (within the same time limit) until the old workers have exited or are shutting
 * down, so they no longer accept connections with the old config and the change is served once the
 * caller's request returns.
 *
 * A config can pass `nginx -t` and still be rejected by the reload, eg. a `listen` on a port that is in use
 * (-t doesn't bind ports). The master then logs an [emerg] line to its error log and keeps the old workers.
 * When opts.errorLog is given, the waiter reads what the master appended to it since the signal and returns
 * with `rejected: true` once the master has given up on the reload, instead of waiting for the full time
 * limit on every save. A failed bind() is retried by nginx (5 times, 500 ms apart) and only the final
 * "still could not bind()" ends the attempt: returning earlier would release the lock while the master can
 * still read the config files, and the next reload would see this attempt's lines as its own.
 *
 * This module has no database imports so it can be unit tested.
 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 25;
// at most this much of the error log is read per poll
const MAX_LOG_READ = 64 * 1024;

/**
 * @param   {String} statText  content of /proc/<pid>/stat
 * @returns {Number|null} the parent pid
 */
const parsePpid = (statText) => {
	// "<pid> (<comm>) <state> <ppid> ...", comm may contain spaces and parentheses
	const end = `${statText}`.lastIndexOf(")");
	if (end < 0) {
		return null;
	}
	const fields = statText
		.slice(end + 1)
		.trim()
		.split(/\s+/);
	const ppid = Number.parseInt(fields[1], 10);
	return Number.isInteger(ppid) ? ppid : null;
};

/**
 * @param   {Object}   [opts]
 * @param   {String}   [opts.procDir]     default /proc
 * @param   {String}   [opts.pidFile]     default /run/nginx/nginx.pid, see docker/rootfs/etc/nginx/nginx.conf
 * @param   {Function} opts.signal        sends the reload signal, eg. runs `nginx -s reload`
 * @param   {String}   [opts.errorLog]    the master's error log, see docker/rootfs/etc/nginx/nginx.conf
 * @param   {Number}   [opts.timeoutMs]
 * @param   {Number}   [opts.intervalMs]
 * @param   {Function} [opts.sleep]       (ms) => Promise
 * @param   {Function} [opts.now]         () => ms
 * @returns {{reloadAndWait: Function, readMasterPid: Function, childPids: Function}}
 */
const createReloadWaiter = (opts) => {
	const procDir = opts.procDir || "/proc";
	const pidFile = opts.pidFile || "/run/nginx/nginx.pid";
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
	const sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	const now = opts.now || (() => Date.now());

	/**
	 * @returns {Promise<Number|null>} the pid of the running master, null when there is none
	 */
	const readMasterPid = async () => {
		try {
			const pid = Number.parseInt((await fs.promises.readFile(pidFile, "utf8")).trim(), 10);
			if (!Number.isInteger(pid) || pid <= 0) {
				return null;
			}
			await fs.promises.access(path.join(procDir, `${pid}`, "stat"));
			return pid;
		} catch {
			return null;
		}
	};

	/**
	 * @param   {Number} master
	 * @returns {Promise<Set<Number>>} the pids whose parent is master
	 */
	const childPids = async (master) => {
		const children = new Set();
		let entries = [];
		try {
			entries = await fs.promises.readdir(procDir);
		} catch {
			return children;
		}
		await Promise.all(
			entries
				.filter((name) => /^\d+$/.test(name))
				.map(async (name) => {
					try {
						const stat = await fs.promises.readFile(path.join(procDir, name, "stat"), "utf8");
						if (parsePpid(stat) === master) {
							children.add(Number.parseInt(name, 10));
						}
					} catch {
						// the process has exited in the meantime
					}
				}),
		);
		return children;
	};

	/**
	 * @param   {Number} pid
	 * @returns {Promise<boolean>} true when the process is gone or an nginx worker that is shutting down
	 */
	const doneOrShuttingDown = async (pid) => {
		try {
			const cmdline = await fs.promises.readFile(path.join(procDir, `${pid}`, "cmdline"), "utf8");
			return cmdline.includes("shutting down");
		} catch {
			return true;
		}
	};

	/**
	 * @returns {Promise<Number|null>} the size of the error log, null when there is none to watch
	 */
	const errorLogSize = async () => {
		if (!opts.errorLog) {
			return null;
		}
		try {
			return (await fs.promises.stat(opts.errorLog)).size;
		} catch {
			return 0;
		}
	};

	/**
	 * @param   {Number} master
	 * @param   {Number} offset  the size of the error log before the signal
	 * @returns {Promise<String|null>} the first [emerg] message the master logged after offset, once it has
	 *          logged one that ends the attempt (anything but a failed bind() that nginx retries)
	 */
	const newEmerg = async (master, offset) => {
		let handle = null;
		try {
			handle = await fs.promises.open(opts.errorLog, "r");
			const { size } = await handle.stat();
			// rotated in the meantime: read the new file from the start
			const from = size < offset ? 0 : offset;
			const length = Math.min(size - from, MAX_LOG_READ);
			if (length <= 0) {
				return null;
			}
			const buffer = Buffer.alloc(length);
			await handle.read(buffer, 0, length, from);
			const messages = buffer
				.toString("utf8")
				.split("\n")
				.filter((l) => l.includes(`[emerg] ${master}#`))
				.map((l) => l.replace(/^.*?\[emerg\] \d+#\d+: /, "").trim());
			const done = messages.some((m) => !/^bind\(\) to .* failed/.test(m));
			return done ? messages[0] : null;
		} catch {
			return null;
		} finally {
			await handle?.close().catch(() => {});
		}
	};

	/**
	 * Signals the reload and waits until the master runs workers it started after the signal and the
	 * workers from before no longer accept connections.
	 *
	 * @returns {Promise<{confirmed: boolean, noMaster?: boolean, rejected?: boolean, oldStillRunning?: boolean,
	 *          emerg?: string, reason?: string, waitedMs: number}>} rejects when signal() rejects
	 */
	const reloadAndWait = async () => {
		const master = await readMasterPid();
		const before = master ? await childPids(master) : null;
		const logOffset = master ? await errorLogSize() : null;
		await opts.signal();
		if (!master) {
			// Nothing was running that could still be reading the config
			return { confirmed: false, noMaster: true, reason: "no nginx master process found", waitedMs: 0 };
		}
		const start = now();
		let applied = false;
		for (;;) {
			const children = await childPids(master);
			if (!applied && [...children].some((pid) => !before.has(pid))) {
				applied = true;
			}
			if (applied) {
				const old = [...before].filter((pid) => children.has(pid));
				const settled = await Promise.all(old.map(doneOrShuttingDown));
				if (settled.every(Boolean)) {
					return { confirmed: true, waitedMs: now() - start };
				}
				if (now() - start >= timeoutMs) {
					// The new config is applied, an old process just takes long to stop accepting
					return { confirmed: true, oldStillRunning: true, waitedMs: now() - start };
				}
				await sleep(intervalMs);
				continue;
			}
			if ((await readMasterPid()) !== master) {
				return { confirmed: false, reason: "the nginx master process has exited", waitedMs: now() - start };
			}
			const emerg = logOffset === null ? null : await newEmerg(master, logOffset);
			if (emerg) {
				return {
					confirmed: false,
					rejected: true,
					emerg,
					reason: `nginx could not apply the config: ${emerg}`,
					waitedMs: now() - start,
				};
			}
			if (now() - start >= timeoutMs) {
				return {
					confirmed: false,
					reason: `nginx started no new worker processes within ${timeoutMs} ms`,
					waitedMs: now() - start,
				};
			}
			await sleep(intervalMs);
		}
	};

	return { reloadAndWait, readMasterPid, childPids };
};

export { createReloadWaiter, parsePpid };
