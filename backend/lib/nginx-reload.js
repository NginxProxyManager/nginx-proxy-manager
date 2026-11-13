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
// the error log is read in chunks of at most this size
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
	 * Reads what the master appends to the error log after the signal. Every call continues where the last one
	 * stopped (in chunks of at most MAX_LOG_READ, until the end of the file), so a rejection that is logged after
	 * many other lines is still found, and keeps what the earlier calls found.
	 *
	 * @param   {Number} master
	 * @param   {Number} offset  the size of the error log before the signal
	 * @returns {Function} async () => {emerg: String|null, bindErrors: String[], restarts: Number}: what the
	 *          master logged after offset so far: the first [emerg] message once it has logged one that ends the
	 *          attempt (anything but a failed bind() that nginx retries), one message per address it could not
	 *          bind (eg. "bind() to [::]:3333 failed (98: Address in use)"), and how many of its children exited
	 *          unexpectedly (nginx starts a new process for each, which is not a new generation)
	 */
	const logReader = (master, offset) => {
		const messages = [];
		let restarts = 0;
		let position = offset;
		// the start of a line whose end has not been written yet
		let partial = Buffer.alloc(0);
		const collect = (text) => {
			for (const l of text.split("\n")) {
				if (l.includes(`[emerg] ${master}#`)) {
					messages.push(l.replace(/^.*?\[emerg\] \d+#\d+: /, "").trim());
				}
				// eg. "[alert] 100#100: worker process 101 exited on signal 9", logged when a child dies without
				// being asked to. Children that exit after a reload (code 0) are logged as [notice], below the level.
				if (
					l.includes(`[alert] ${master}#`) &&
					/: [a-z ]+ process \d+ exited (on signal|with code)/.test(l) &&
					!/cannot be respawned/.test(l)
				) {
					restarts++;
				}
			}
		};
		const result = () => {
			const done = messages.some((m) => !/^bind\(\) to .* failed/.test(m));
			// a message for every address nginx could not bind (it logs them again on every attempt)
			const bindErrors = [...new Set(messages.filter((m) => /^bind\(\) to \S+ failed/.test(m)))];
			return { emerg: done ? messages[0] : null, bindErrors, restarts };
		};
		return async () => {
			if (offset === null) {
				return result();
			}
			let handle = null;
			try {
				handle = await fs.promises.open(opts.errorLog, "r");
				const { size } = await handle.stat();
				if (size < position) {
					// rotated in the meantime: read the new file from the start
					position = 0;
					partial = Buffer.alloc(0);
				}
				while (position < size) {
					const length = Math.min(size - position, MAX_LOG_READ);
					const buffer = Buffer.alloc(length);
					const { bytesRead } = await handle.read(buffer, 0, length, position);
					if (bytesRead <= 0) {
						break;
					}
					position += bytesRead;
					const data = Buffer.concat([partial, buffer.subarray(0, bytesRead)]);
					const end = data.lastIndexOf(0x0a);
					if (end < 0) {
						partial = data;
						continue;
					}
					collect(data.subarray(0, end).toString("utf8"));
					partial = data.subarray(end + 1);
				}
			} catch {
				// keep what was found so far
			} finally {
				await handle?.close().catch(() => {});
			}
			return result();
		};
	};

	/**
	 * Signals the reload and waits until a new generation of workers has replaced the workers from before:
	 * the master runs more new children than it restarted after crashes, and every child from before has
	 * exited or is shutting down. Until then it keeps checking the error log for a rejection: a worker that
	 * crashed and was restarted while the reload is rejected must not count as the reload.
	 *
	 * @returns {Promise<{confirmed: boolean, noMaster?: boolean, rejected?: boolean, emerg?: string,
	 *          bindErrors?: string[], reason?: string, waitedMs: number}>} rejects when signal() rejects
	 */
	const reloadAndWait = async () => {
		const master = await readMasterPid();
		// The log baseline first: a worker that crashes after the child snapshot below has its crash alert after
		// the offset, so its replacement counts as a restart, not as a fresh child of the reload
		const logOffset = master ? await errorLogSize() : null;
		const before = master ? await childPids(master) : null;
		await opts.signal();
		if (!master) {
			// Nothing was running that could still be reading the config
			return { confirmed: false, noMaster: true, reason: "no nginx master process found", waitedMs: 0 };
		}
		const readLog = logReader(master, logOffset);
		const start = now();
		let fresh = 0;
		for (;;) {
			const children = await childPids(master);
			fresh = [...children].filter((pid) => !before.has(pid)).length;
			if ((await readMasterPid()) !== master) {
				return { confirmed: false, reason: "the nginx master process has exited", waitedMs: now() - start };
			}
			const log = await readLog();
			if (log.emerg) {
				return {
					confirmed: false,
					rejected: true,
					emerg: log.emerg,
					bindErrors: log.bindErrors,
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
