import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { incremental, makeHostTarget, normalizeTailLines, snapshot } from "../../internal/nginx-log-reader.js";

const createLogDir = async () => fs.mkdtemp(path.join(os.tmpdir(), "npm-nginx-log-reader-"));
const target = () => makeHostTarget("proxy_host", 42, "access");
const fileFor = (root) => path.join(root, "proxy-host-42_access.log");

const withLogDir = async (callback) => {
	const root = await createLogDir();
	try {
		await callback(root);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
};

test("LOG-001 snapshot returns only the requested complete tail lines", async () => {
	await withLogDir(async (root) => {
		await fs.writeFile(fileFor(root), "first\nsecond\nthird\nfourth\n");
		const result = await snapshot({ target: target(), tailLines: 2, userId: 7, rootDir: root });
		assert.equal(result.content, "third\nfourth\n");
		assert.equal(result.lines_returned, 2);
		assert.equal(result.file.exists, true);
		assert.ok(result.next_cursor);
	});
});

test("LOG-002 incremental reads appended lines and advances the signed cursor", async () => {
	await withLogDir(async (root) => {
		await fs.writeFile(fileFor(root), "before\n");
		const initial = await snapshot({ target: target(), tailLines: 50, userId: 7, rootDir: root });
		await fs.appendFile(fileFor(root), "after-one\nafter-two\n");
		const result = await incremental({ target: target(), cursor: initial.next_cursor, userId: 7, rootDir: root });
		assert.equal(result.reset, false);
		assert.equal(result.mode, "incremental");
		assert.equal(result.content, "after-one\nafter-two\n");
		assert.notEqual(result.next_cursor, initial.next_cursor);
	});
});

test("LOG-003 keeps an incomplete final line until it is newline terminated", async () => {
	await withLogDir(async (root) => {
		await fs.writeFile(fileFor(root), "before\n");
		const initial = await snapshot({ target: target(), tailLines: 50, userId: 7, rootDir: root });
		await fs.appendFile(fileFor(root), "partial");
		const first = await incremental({ target: target(), cursor: initial.next_cursor, userId: 7, rootDir: root });
		assert.equal(first.content, "");
		assert.ok(first.next_cursor);
		await fs.appendFile(fileFor(root), "-line\n");
		const second = await incremental({ target: target(), cursor: first.next_cursor, userId: 7, rootDir: root });
		assert.equal(second.content, "partial-line\n");
	});
});

test("LOG-004 reports a reset after file rotation", async () => {
	await withLogDir(async (root) => {
		const current = fileFor(root);
		await fs.writeFile(current, "old\n");
		const initial = await snapshot({ target: target(), tailLines: 50, userId: 7, rootDir: root });
		await fs.rename(current, `${current}.1`);
		await fs.writeFile(current, "new\n");
		const result = await incremental({ target: target(), cursor: initial.next_cursor, userId: 7, rootDir: root });
		assert.equal(result.reset, true);
		assert.equal(result.reset_reason, "rotated");
		assert.equal(result.content, "new\n");
	});
});

test("LOG-005 a missing log provides a cursor so follow can wait for its creation", async () => {
	await withLogDir(async (root) => {
		const initial = await snapshot({ target: target(), tailLines: 50, userId: 7, rootDir: root });
		assert.equal(initial.file.exists, false);
		assert.ok(initial.next_cursor);
		const absent = await incremental({ target: target(), cursor: initial.next_cursor, userId: 7, rootDir: root });
		assert.equal(absent.reset, false);
		await fs.writeFile(fileFor(root), "created\n");
		const created = await incremental({ target: target(), cursor: absent.next_cursor, userId: 7, rootDir: root });
		assert.equal(created.reset, true);
		assert.equal(created.content, "created\n");
	});
});

test("LOG-006 rejects non-whitelisted log target inputs", async () => {
	assert.throws(() => makeHostTarget("proxy_host", 42, "anything"));
	assert.throws(() => normalizeTailLines("100"));
	assert.throws(() => normalizeTailLines("50oops"));
	const root = await createLogDir();
	try {
		await fs.mkdir(fileFor(root));
		await assert.rejects(() => snapshot({ target: makeHostTarget("proxy_host", 42, "access"), tailLines: 50, userId: 7, rootDir: root }));
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
