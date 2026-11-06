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

		// an old worker that never stops: the new config is applied all the same
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
		assert.deepEqual(await waiter2.reloadAndWait(), { confirmed: true, oldStillRunning: true, waitedMs: 200 });
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
