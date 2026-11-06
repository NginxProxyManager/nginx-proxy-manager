/**
 * `nginx -s reload` only signals the master process and returns at once. The master then reads the config
 * files asynchronously. If the lock (see lib/nginx-lock.js) is released at that point, the next holder may
 * already write a candidate file that nginx rejects: the master reads that file, the reload fails and the
 * change that was saved before is never applied, although it was tested and stored.
 *
 * reloadAndWait() therefore signals the master and waits until the reload has really happened: the master
 * starts a new generation of worker processes once it has read and applied the new config, and tells the
 * workers from before to shut down. The workers are the master's children in /proc. The reload counts as
 * applied once new children run and every child from before has exited or is shutting down, so they no
 * longer accept connections with the old config and the change is served once the caller's request returns.
 * A new child alone proves nothing: the master also restarts a worker that crashed, with the old config
 * (and logs an [alert] for it, which is not counted as a new generation). When the master can't be found
 * (eg. nginx is not running yet) or no new generation has replaced the old one in time, the result says the
 * reload is not confirmed and the caller decides what to do.
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
	 * @returns {Promise<{emerg: String|null, restarts: Number}>} what the master logged after offset: the first
	 *          [emerg] message once it has logged one that ends the attempt (anything but a failed bind() that
	 *          nginx retries), and how many of its children exited unexpectedly (nginx starts a new process
	 *          for each, which is not a new generation)
	 */
	const readLog = async (master, offset) => {
		const none = { emerg: null, restarts: 0 };
		if (offset === null) {
			return none;
		}
		let handle = null;
		try {
			handle = await fs.promises.open(opts.errorLog, "r");
			const { size } = await handle.stat();
			// rotated in the meantime: read the new file from the start
			const from = size < offset ? 0 : offset;
			const length = Math.min(size - from, MAX_LOG_READ);
			if (length <= 0) {
				return none;
			}
			const buffer = Buffer.alloc(length);
			await handle.read(buffer, 0, length, from);
			const lines = buffer.toString("utf8").split("\n");
			const messages = lines
				.filter((l) => l.includes(`[emerg] ${master}#`))
				.map((l) => l.replace(/^.*?\[emerg\] \d+#\d+: /, "").trim());
			const done = messages.some((m) => !/^bind\(\) to .* failed/.test(m));
			// eg. "[alert] 100#100: worker process 101 exited on signal 9", logged when a child dies without
			// being asked to. Children that exit after a reload (code 0) are logged as [notice], below the level.
			const restarts = lines.filter(
				(l) =>
					l.includes(`[alert] ${master}#`) &&
					/: [a-z ]+ process \d+ exited (on signal|with code)/.test(l) &&
					!/cannot be respawned/.test(l),
			).length;
			return { emerg: done ? messages[0] : null, restarts };
		} catch {
			return none;
		} finally {
			await handle?.close().catch(() => {});
		}
	};

	/**
	 * Signals the reload and waits until a new generation of workers has replaced the workers from before:
	 * the master runs more new children than it restarted after crashes, and every child from before has
	 * exited or is shutting down. Until then it keeps checking the error log for a rejection: a worker that
	 * crashed and was restarted while the reload is rejected must not count as the reload.
	 *
	 * @returns {Promise<{confirmed: boolean, noMaster?: boolean, rejected?: boolean, emerg?: string,
	 *          reason?: string, waitedMs: number}>} rejects when signal() rejects
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
		let fresh = 0;
		for (;;) {
			const children = await childPids(master);
			fresh = [...children].filter((pid) => !before.has(pid)).length;
			if ((await readMasterPid()) !== master) {
				return { confirmed: false, reason: "the nginx master process has exited", waitedMs: now() - start };
			}
			const log = await readLog(master, logOffset);
			if (log.emerg) {
				return {
					confirmed: false,
					rejected: true,
					emerg: log.emerg,
					reason: `nginx could not apply the config: ${log.emerg}`,
					waitedMs: now() - start,
				};
			}
			if (fresh > log.restarts) {
				const old = [...before].filter((pid) => children.has(pid));
				const settled = await Promise.all(old.map(doneOrShuttingDown));
				if (settled.every(Boolean)) {
					return { confirmed: true, waitedMs: now() - start };
				}
			}
			if (now() - start >= timeoutMs) {
				return {
					confirmed: false,
					reason: fresh
						? `the nginx workers from before the reload were still running after ${timeoutMs} ms`
						: `nginx started no new worker processes within ${timeoutMs} ms`,
					waitedMs: now() - start,
				};
			}
			await sleep(intervalMs);
		}
	};

	return { reloadAndWait, readMasterPid, childPids };
};

export { createReloadWaiter, parsePpid };
