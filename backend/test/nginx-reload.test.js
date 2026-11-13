import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createReloadWaiter, parsePpid } from "../lib/nginx-reload.js";

const roots = [];
after(() => {
	for (const root of roots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

/**
 * A fake /proc with an nginx master (pid 100) and its workers, plus the pid file
 */
const fakeNginx = (workers = [101, 102]) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-reload-"));
	roots.push(root);
	const procDir = path.join(root, "proc");
	const pidFile = path.join(root, "nginx.pid");
	const addProcess = (pid, ppid, comm = "nginx", title = "nginx: worker process") => {
		fs.mkdirSync(path.join(procDir, `${pid}`), { recursive: true });
		fs.writeFileSync(path.join(procDir, `${pid}`, "stat"), `${pid} (${comm}) S ${ppid} ${pid} ${pid} 0 -1 4194624`);
		fs.writeFileSync(path.join(procDir, `${pid}`, "cmdline"), `${title}\0`);
	};
	const shuttingDown = (pid) =>
		fs.writeFileSync(path.join(procDir, `${pid}`, "cmdline"), "nginx: worker process is shutting down\0");
	const removeProcess = (pid) => fs.rmSync(path.join(procDir, `${pid}`), { recursive: true, force: true });
	fs.mkdirSync(procDir, { recursive: true });
	addProcess(1, 0, "s6-svscan");
	addProcess(100, 1);
	for (const pid of workers) {
		addProcess(pid, 100);
	}
	// an unrelated process of another parent
	addProcess(200, 1, "node");
	addProcess(201, 200, "node (worker) x");
	fs.writeFileSync(pidFile, "100\n");
	return { procDir, pidFile, addProcess, removeProcess, shuttingDown };
};

/** A clock that only moves when the waiter sleeps */
const fakeClock = () => {
	let t = 0;
	const sleeps = [];
	return {
		now: () => t,
		sleep: async (ms) => {
			sleeps.push(ms);
			t += ms;
		},
		sleeps,
	};
};

describe("parsePpid", () => {
	it("reads the parent pid, also when the command name has spaces and parentheses", () => {
		assert.equal(parsePpid("101 (nginx) S 100 100 100 0"), 100);
		assert.equal(parsePpid("7 (a b) (c)) R 3 7 7"), 3);
		assert.equal(parsePpid("garbage"), null);
	});
});

describe("createReloadWaiter", () => {
	it("is confirmed once the master runs a worker that did not exist before the signal", async () => {
		const nginx = fakeNginx();
		const clock = fakeClock();
		const events = [];
		let polls = 0;
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			now: clock.now,
			sleep: async (ms) => {
				polls++;
				events.push(`sleep ${ms}`);
				if (polls === 3) {
					// the master has read the config and starts the new generation, the old workers shut down
					nginx.addProcess(103, 100);
					nginx.addProcess(104, 100);
					nginx.removeProcess(101);
					nginx.shuttingDown(102);
				}
				await clock.sleep(ms);
			},
			intervalMs: 25,
			signal: async () => {
				events.push("signal");
			},
		});
		const outcome = await waiter.reloadAndWait();
		assert.equal(outcome.confirmed, true);
		assert.equal(outcome.waitedMs, 75);
		assert.deepEqual(events, ["signal", "sleep 25", "sleep 25", "sleep 25"]);
	});

	it("waits until the old workers no longer accept connections, but not past the time limit", async () => {
		const nginx = fakeNginx();
		const clock = fakeClock();
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			now: clock.now,
			sleep: async (ms) => {
				if (clock.sleeps.length === 3) {
					// still handling a long request, it doesn't accept new connections any more
					nginx.shuttingDown(101);
					nginx.shuttingDown(102);
				}
				await clock.sleep(ms);
			},
			intervalMs: 10,
			signal: async () => {
				nginx.addProcess(103, 100);
			},
		});
		const outcome = await waiter.reloadAndWait();
		assert.deepEqual(outcome, { confirmed: true, waitedMs: 40 });

		// an old worker that is neither gone nor shutting down: no new generation has replaced the old one
		const stuck = fakeNginx();
		const clock2 = fakeClock();
		const waiter2 = createReloadWaiter({
			procDir: stuck.procDir,
			pidFile: stuck.pidFile,
			now: clock2.now,
			sleep: clock2.sleep,
			timeoutMs: 200,
			intervalMs: 50,
			signal: async () => {
				stuck.addProcess(103, 100);
				stuck.removeProcess(101);
			},
		});
		assert.deepEqual(await waiter2.reloadAndWait(), {
			confirmed: false,
			reason: "the nginx workers from before the reload were still running after 200 ms",
			waitedMs: 200,
		});
	});

	it("does not count the worker processes of the old generation or processes of other parents", async () => {
		const nginx = fakeNginx();
		const clock = fakeClock();
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			now: clock.now,
			sleep: async (ms) => {
				// a new child of another process, the nginx workers stay the same
				nginx.addProcess(300 + clock.sleeps.length, 200, "node");
				await clock.sleep(ms);
			},
			timeoutMs: 1000,
			intervalMs: 100,
			signal: async () => {},
		});
		const outcome = await waiter.reloadAndWait();
		assert.equal(outcome.confirmed, false);
		assert.equal(outcome.noMaster, undefined);
		assert.match(outcome.reason, /no new worker processes within 1000 ms/);
		// bounded, and it slept between the polls
		assert.equal(outcome.waitedMs, 1000);
		assert.equal(clock.sleeps.length, 10);
	});

	it("returns at once when the master logs that it can't apply the config, eg. a listen port in use", async () => {
		const nginx = fakeNginx();
		const clock = fakeClock();
		const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
		// from before the signal, and from another process: neither counts
		fs.writeFileSync(errorLog, "2026/11/05 10:00:00 [emerg] 100#100: an old error\n");
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			errorLog,
			now: clock.now,
			sleep: async (ms) => {
				if (clock.sleeps.length === 2) {
					fs.appendFileSync(
						errorLog,
						"2026/11/05 10:00:01 [notice] 100#100: signal 1 (SIGHUP) received from 300, reconfiguring\n" +
							"2026/11/05 10:00:01 [emerg] 300#300: from the signal process\n" +
							"2026/11/05 10:00:01 [emerg] 100#100: bind() to 0.0.0.0:3000 failed (98: Address in use)\n",
					);
				}
				// nginx retries a failed bind(): the attempt only ends with "still could not bind()"
				if (clock.sleeps.length === 4) {
					fs.appendFileSync(
						errorLog,
						"2026/11/05 10:00:01 [emerg] 100#100: bind() to 0.0.0.0:3000 failed (98: Address in use)\n" +
							"2026/11/05 10:00:01 [emerg] 100#100: bind() to [::]:3000 failed (98: Address in use)\n" +
							"2026/11/05 10:00:02 [emerg] 100#100: still could not bind()\n",
					);
				}
				await clock.sleep(ms);
			},
			intervalMs: 25,
			signal: async () => {},
		});
		const outcome = await waiter.reloadAndWait();
		assert.deepEqual(outcome, {
			confirmed: false,
			rejected: true,
			emerg: "bind() to 0.0.0.0:3000 failed (98: Address in use)",
			// every address it could not bind, once
			bindErrors: [
				"bind() to 0.0.0.0:3000 failed (98: Address in use)",
				"bind() to [::]:3000 failed (98: Address in use)",
			],
			reason: "nginx could not apply the config: bind() to 0.0.0.0:3000 failed (98: Address in use)",
			waitedMs: 125,
		});

		// without new errors it still waits for the workers as before
		const clock2 = fakeClock();
		const waiter2 = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			errorLog,
			now: clock2.now,
			sleep: clock2.sleep,
			timeoutMs: 100,
			intervalMs: 50,
			signal: async () => {},
		});
		const outcome2 = await waiter2.reloadAndWait();
		assert.equal(outcome2.rejected, undefined);
		assert.match(outcome2.reason, /no new worker processes within 100 ms/);
	});

	describe("an error log that grows by more than one read", () => {
		// each line is about 130 bytes: 1000 of them are more than the 64 KiB read at once
		const warnings = (n, from = 0) =>
			Array.from(
				{ length: n },
				(_, i) =>
					`2026/11/05 10:00:01 [warn] 100#100: "ssl_stapling" ignored, issuer certificate not found for certificate "/etc/letsencrypt/live/npm-${from + i}/fullchain.pem"\n`,
			).join("");
		const rejection =
			"2026/11/05 10:00:01 [emerg] 100#100: bind() to 0.0.0.0:3000 failed (98: Address in use)\n" +
			"2026/11/05 10:00:03 [emerg] 100#100: still could not bind()\n";
		const waiterFor = (nginx, clock, errorLog, onSleep) =>
			createReloadWaiter({
				procDir: nginx.procDir,
				pidFile: nginx.pidFile,
				errorLog,
				now: clock.now,
				sleep: async (ms) => {
					onSleep(clock.sleeps.length);
					await clock.sleep(ms);
				},
				intervalMs: 25,
				timeoutMs: 1000,
				signal: async () => {},
			});

		it("finds a rejection logged after more than 64 KiB of warnings", async () => {
			const nginx = fakeNginx();
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "2026/11/05 09:00:00 [emerg] 100#100: an old error\n");
			const text = warnings(1000) + rejection;
			assert.ok(text.length > 2 * 64 * 1024);
			const waiter = waiterFor(nginx, clock, errorLog, (n) => {
				if (n === 0) {
					fs.appendFileSync(errorLog, text);
				}
			});
			const outcome = await waiter.reloadAndWait();
			assert.equal(outcome.rejected, true);
			assert.equal(outcome.emerg, "bind() to 0.0.0.0:3000 failed (98: Address in use)");
			assert.equal(outcome.waitedMs, 25);
		});

		it("keeps what it read before and finds lines split across reads and polls", async () => {
			const nginx = fakeNginx();
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "");
			const first = warnings(500) + rejection.slice(0, 100);
			assert.ok(first.length > 64 * 1024);
			const waiter = waiterFor(nginx, clock, errorLog, (n) => {
				if (n === 0) {
					// the first bind() failure and half of the line that ends the attempt
					fs.appendFileSync(errorLog, first);
				}
				if (n === 2) {
					fs.appendFileSync(errorLog, rejection.slice(100));
				}
			});
			const outcome = await waiter.reloadAndWait();
			assert.equal(outcome.rejected, true);
			// the first [emerg] of the attempt, read in an earlier poll
			assert.equal(outcome.emerg, "bind() to 0.0.0.0:3000 failed (98: Address in use)");
			assert.equal(outcome.waitedMs, 75);
		});

		it("counts worker restarts logged after more than 64 KiB", async () => {
			const nginx = fakeNginx([101]);
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "");
			const waiter = waiterFor(nginx, clock, errorLog, (n) => {
				if (n === 0) {
					// the only worker crashed and was restarted: not a reload
					nginx.removeProcess(101);
					nginx.addProcess(103, 100);
					fs.appendFileSync(
						errorLog,
						`${warnings(1000)}2026/11/05 10:00:01 [alert] 100#100: worker process 101 exited on signal 9\n`,
					);
				}
			});
			const outcome = await waiter.reloadAndWait();
			assert.equal(outcome.confirmed, false);
			assert.equal(outcome.rejected, undefined);
			assert.equal(outcome.waitedMs, 1000);
		});

		it("counts a worker that crashes while the baselines are taken as a restart", async () => {
			const nginx = fakeNginx([101]);
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "");
			// the only worker crashes right after the first of the two baselines (log size, child pids) is read
			const { stat, readdir } = fs.promises;
			let crashed = false;
			const crashOnce = () => {
				if (!crashed) {
					crashed = true;
					nginx.removeProcess(101);
					nginx.addProcess(103, 100);
					fs.appendFileSync(errorLog, "2026/11/05 10:00:01 [alert] 100#100: worker process 101 exited on signal 11\n");
				}
			};
			fs.promises.stat = async (...args) => {
				const out = await stat(...args);
				if (args[0] === errorLog) {
					crashOnce();
				}
				return out;
			};
			fs.promises.readdir = async (...args) => {
				const out = await readdir(...args);
				if (args[0] === nginx.procDir) {
					crashOnce();
				}
				return out;
			};
			try {
				const outcome = await waiterFor(nginx, clock, errorLog, () => {}).reloadAndWait();
				// the master never applied the reload: the restarted worker must not confirm it
				assert.equal(outcome.confirmed, false);
				assert.equal(outcome.waitedMs, 1000);
			} finally {
				fs.promises.stat = stat;
				fs.promises.readdir = readdir;
			}
		});
	});

	describe("a worker that crashed and was restarted while the reload is rejected", () => {
		const restart = (nginx, errorLog, pid, replacement) => {
			nginx.removeProcess(pid);
			nginx.addProcess(replacement, 100);
			fs.appendFileSync(errorLog, `2026/11/05 10:00:01 [alert] 100#100: worker process ${pid} exited on signal 9\n`);
		};
		const rejectBind = (errorLog) =>
			fs.appendFileSync(
				errorLog,
				"2026/11/05 10:00:01 [emerg] 100#100: bind() to 0.0.0.0:3000 failed (98: Address in use)\n" +
					"2026/11/05 10:00:03 [emerg] 100#100: still could not bind()\n",
			);

		it("keeps checking for the rejection while the other old workers keep running", async () => {
			const nginx = fakeNginx();
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "");
			const waiter = createReloadWaiter({
				procDir: nginx.procDir,
				pidFile: nginx.pidFile,
				errorLog,
				now: clock.now,
				sleep: async (ms) => {
					// the master reaps and restarts the crashed worker first, then fails to bind() for 2.5 s
					if (clock.sleeps.length === 1) {
						// no [alert] line: an old worker that exited with code 0 is logged below the level
						nginx.removeProcess(101);
						nginx.addProcess(103, 100);
					}
					if (clock.sleeps.length === 100) {
						rejectBind(errorLog);
					}
					await clock.sleep(ms);
				},
				intervalMs: 25,
				signal: async () => {},
			});
			const outcome = await waiter.reloadAndWait();
			assert.equal(outcome.confirmed, false);
			assert.equal(outcome.rejected, true);
			assert.equal(outcome.emerg, "bind() to 0.0.0.0:3000 failed (98: Address in use)");
			assert.equal(outcome.waitedMs, 2525);
		});

		it("does not count the restarted worker of a single-worker nginx as a new generation", async () => {
			const nginx = fakeNginx([101]);
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "");
			const waiter = createReloadWaiter({
				procDir: nginx.procDir,
				pidFile: nginx.pidFile,
				errorLog,
				now: clock.now,
				sleep: async (ms) => {
					if (clock.sleeps.length === 1) {
						// the only old worker is gone and a new child runs: what a reload looks like in /proc
						restart(nginx, errorLog, 101, 103);
					}
					if (clock.sleeps.length === 40) {
						rejectBind(errorLog);
					}
					await clock.sleep(ms);
				},
				intervalMs: 25,
				signal: async () => {},
			});
			const outcome = await waiter.reloadAndWait();
			assert.equal(outcome.rejected, true);
			assert.equal(outcome.waitedMs, 1025);

			// without a rejection and without a reload it is not confirmed either, within the time limit
			const quiet = fakeNginx([101]);
			const clock2 = fakeClock();
			const log2 = path.join(path.dirname(quiet.pidFile), "fallback_error.log");
			fs.writeFileSync(log2, "");
			const waiter2 = createReloadWaiter({
				procDir: quiet.procDir,
				pidFile: quiet.pidFile,
				errorLog: log2,
				now: clock2.now,
				sleep: clock2.sleep,
				timeoutMs: 200,
				intervalMs: 50,
				signal: async () => restart(quiet, log2, 101, 103),
			});
			const outcome2 = await waiter2.reloadAndWait();
			assert.equal(outcome2.confirmed, false);
			assert.equal(outcome2.rejected, undefined);
			assert.equal(outcome2.waitedMs, 200);
		});

		it("confirms a reload that replaced the old generation although a worker was restarted before", async () => {
			const nginx = fakeNginx();
			const clock = fakeClock();
			const errorLog = path.join(path.dirname(nginx.pidFile), "fallback_error.log");
			fs.writeFileSync(errorLog, "");
			const waiter = createReloadWaiter({
				procDir: nginx.procDir,
				pidFile: nginx.pidFile,
				errorLog,
				now: clock.now,
				sleep: async (ms) => {
					if (clock.sleeps.length === 1) {
						restart(nginx, errorLog, 101, 103);
					}
					if (clock.sleeps.length === 3) {
						// the reload: a new generation, every child from before is told to shut down
						nginx.addProcess(104, 100);
						nginx.addProcess(105, 100);
						nginx.shuttingDown(102);
						nginx.shuttingDown(103);
					}
					await clock.sleep(ms);
				},
				intervalMs: 25,
				signal: async () => {},
			});
			assert.deepEqual(await waiter.reloadAndWait(), { confirmed: true, waitedMs: 100 });
		});
	});

	it("reports a master that has exited", async () => {
		const nginx = fakeNginx();
		const clock = fakeClock();
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			now: clock.now,
			sleep: clock.sleep,
			signal: async () => {
				nginx.removeProcess(100);
			},
		});
		const outcome = await waiter.reloadAndWait();
		assert.equal(outcome.confirmed, false);
		assert.match(outcome.reason, /exited/);
		assert.equal(clock.sleeps.length, 0);
	});

	it("signals without waiting when no master runs", async () => {
		const nginx = fakeNginx();
		fs.rmSync(nginx.pidFile);
		let signalled = false;
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			sleep: async () => assert.fail("must not wait"),
			signal: async () => {
				signalled = true;
			},
		});
		const outcome = await waiter.reloadAndWait();
		assert.equal(signalled, true);
		assert.equal(outcome.confirmed, false);
		assert.equal(outcome.noMaster, true);
	});

	it("passes on a failed signal", async () => {
		const nginx = fakeNginx();
		const waiter = createReloadWaiter({
			procDir: nginx.procDir,
			pidFile: nginx.pidFile,
			signal: async () => {
				throw new Error("kill failed");
			},
		});
		await assert.rejects(waiter.reloadAndWait(), /kill failed/);
	});
});
