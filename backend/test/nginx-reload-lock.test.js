import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { createReloadWaiter } from "../lib/nginx-reload.js";
import { db, load } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-reload-lock-"));
after(() => {
	fs.rmSync(root, { recursive: true, force: true });
	return db.destroy();
});

const realWaiter = internalNginx.reloadWaiter;
const realTest = internalNginx.test;
const restore = () => {
	internalNginx.reloadWaiter = realWaiter;
	internalNginx.test = realTest;
};

it("keeps the lock until nginx has applied the reload, so the next holder can't spoil it", async () => {
	const procDir = path.join(root, "proc");
	const pidFile = path.join(root, "nginx.pid");
	const addProcess = (pid, ppid) => {
		fs.mkdirSync(path.join(procDir, `${pid}`), { recursive: true });
		fs.writeFileSync(path.join(procDir, `${pid}`, "stat"), `${pid} (nginx) S ${ppid} 0 0 0`);
	};
	addProcess(100, 1);
	addProcess(101, 100);
	fs.writeFileSync(pidFile, "100");

	const events = [];
	internalNginx.reloadWaiter = createReloadWaiter({
		procDir,
		pidFile,
		intervalMs: 5,
		signal: async () => {
			events.push("signal reload");
			// the master reads the config some time after the signal, then starts new workers
			setTimeout(() => {
				events.push("master applied the config");
				addProcess(102, 100);
			}, 40);
		},
	});
	try {
		const first = internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		// eg. the next save, which writes a candidate file that nginx rejects and puts the old file back
		const second = internalNginx.withLock(async () => {
			events.push("next holder writes a candidate");
		});
		await Promise.all([first, second]);
		assert.deepEqual(events, ["signal reload", "master applied the config", "next holder writes a candidate"]);
	} finally {
		restore();
	}
});

it("reloads once more before the lock is released when a reload was not confirmed, eg. after a rollback", async () => {
	const events = [];
	const outcomes = [
		{ confirmed: false, reason: "nginx started no new worker processes within 5000 ms" },
		{ confirmed: true, waitedMs: 1 },
	];
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			events.push("reload");
			return outcomes.shift();
		},
	};
	internalNginx.test = async () => {
		events.push("nginx -t");
	};
	try {
		const first = internalNginx.withLock(async () => {
			await internalNginx.reloadNginx({ skipTest: true });
			// nested section: runs directly, the reload is settled only at the end of the outer section
			await internalNginx.withLock(async () => {
				events.push("rejected candidate rolled back");
			});
		});
		const second = internalNginx.withLock(async () => {
			events.push("next section");
		});
		await Promise.all([first, second]);
		assert.deepEqual(events, ["reload", "rejected candidate rolled back", "nginx -t", "reload", "next section"]);
	} finally {
		restore();
	}
});

it("tries only once more when nginx does not apply the config at all", async () => {
	const events = [];
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			events.push("reload");
			return { confirmed: false, reason: "nginx started no new worker processes within 5000 ms" };
		},
	};
	internalNginx.test = async () => {
		events.push("nginx -t");
	};
	try {
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		await internalNginx.withLock(async () => {
			events.push("next section");
		});
		assert.deepEqual(events, ["reload", "nginx -t", "reload", "next section"]);

		// every later save would wait twice: until a reload is confirmed again, it isn't settled any more
		events.length = 0;
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		assert.deepEqual(events, ["reload", "reload"]);

		// once nginx applies a config again, an unconfirmed reload is settled as before
		events.length = 0;
		const outcomes = [
			{ confirmed: true, waitedMs: 1 },
			{ confirmed: false, reason: "nginx started no new worker processes within 5000 ms" },
			{ confirmed: true, waitedMs: 1 },
		];
		internalNginx.reloadWaiter = {
			reloadAndWait: async () => {
				events.push("reload");
				return outcomes.shift();
			},
		};
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		assert.deepEqual(events, ["reload", "reload", "nginx -t", "reload"]);
	} finally {
		restore();
	}
});

it("does not wait or reload again when nginx rejected the config it read", async () => {
	const events = [];
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			events.push("reload");
			return {
				confirmed: false,
				rejected: true,
				reason: "nginx could not apply the config: bind() to 0.0.0.0:3000 failed (98: Address in use)",
			};
		},
	};
	internalNginx.test = async () => {
		events.push("nginx -t");
	};
	try {
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		assert.deepEqual(events, ["reload", "reload"]);
	} finally {
		restore();
	}
});

it("does not reload again when the config fails the test or when no nginx runs", async () => {
	const events = [];
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			events.push("reload");
			return { confirmed: false, reason: "nginx started no new worker processes within 5000 ms" };
		},
	};
	internalNginx.test = async () => {
		events.push("nginx -t");
		throw new Error('nginx: [emerg] unknown directive "x" in /data/nginx/proxy_host/1.conf:1');
	};
	try {
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		assert.deepEqual(events, ["reload", "nginx -t"]);

		events.length = 0;
		internalNginx.reloadWaiter = {
			reloadAndWait: async () => {
				events.push("reload");
				return { confirmed: false, noMaster: true, reason: "no nginx master process found" };
			},
		};
		await internalNginx.withLock(() => internalNginx.reloadNginx({ skipTest: true }));
		await internalNginx.withLock(async () => {});
		assert.deepEqual(events, ["reload"]);
	} finally {
		restore();
	}
});
