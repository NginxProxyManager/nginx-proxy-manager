import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { getNginxFileStem } from "./utils.js";
import {
	LOG_PREFIX_BY_TYPE,
	currentLogPaths,
	listStaleLogFilesForHost,
	logFilenamesForStem,
	logPrefixForHostType,
	parseHostLogFilename,
	renameStaleLogsToCurrent,
	stemBelongsToHostId,
} from "./nginx_host_logs.js";

const mkTempLogsDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "npm-host-logs-"));

describe("logPrefixForHostType", () => {
	it("maps known host kinds to nginx log filename prefixes", () => {
		assert.equal(logPrefixForHostType("proxy_host"), "proxy-host");
		assert.equal(logPrefixForHostType("redirection_host"), "redirection-host");
		assert.equal(logPrefixForHostType("dead_host"), "dead-host");
		assert.equal(logPrefixForHostType("stream"), "stream");
	});

	it("returns null for unknown kinds", () => {
		assert.equal(logPrefixForHostType("unknown"), null);
	});

	it("matches LOG_PREFIX_BY_TYPE keys", () => {
		assert.deepEqual(LOG_PREFIX_BY_TYPE, {
			proxy_host: "proxy-host",
			redirection_host: "redirection-host",
			dead_host: "dead-host",
			stream: "stream",
		});
	});
});

describe("logFilenamesForStem / currentLogPaths", () => {
	it("builds active path pair from prefix and stem", () => {
		const dir = "/data/logs";
		assert.deepEqual(logFilenamesForStem(dir, "proxy-host", "5.app.example.com"), {
			access: path.join(dir, "proxy-host-5.app.example.com_access.log"),
			error: path.join(dir, "proxy-host-5.app.example.com_error.log"),
		});
	});

	it("matches getNginxFileStem for proxy and stream rows", () => {
		const dir = mkTempLogsDir();
		// Basename uses domain_names[0] as stored (DB rows are sorted on save).
		const proxyRow = { id: 2, domain_names: ["a.example.com", "z.example.com"] };
		const stem = getNginxFileStem("proxy_host", proxyRow);
		assert.equal(stem, "2.a.example.com");
		const paths = currentLogPaths(dir, "proxy_host", proxyRow);
		assert.deepEqual(paths, logFilenamesForStem(dir, "proxy-host", stem));

		const streamRow = { id: 3, incoming_port: 443 };
		const sStem = getNginxFileStem("stream", streamRow);
		const sPaths = currentLogPaths(dir, "stream", streamRow);
		assert.deepEqual(sPaths, logFilenamesForStem(dir, "stream", sStem));
	});
});

describe("stemBelongsToHostId", () => {
	it("accepts id-only and id.slug stems for the numeric id", () => {
		assert.equal(stemBelongsToHostId("5", 5), true);
		assert.equal(stemBelongsToHostId("5.foo.com", 5), true);
	});

	it("does not treat 51 as belonging to host 5", () => {
		assert.equal(stemBelongsToHostId("51", 5), false);
		assert.equal(stemBelongsToHostId("51", 51), true);
	});
});

describe("parseHostLogFilename", () => {
	it("parses active logs and rotation / gzip suffixes", () => {
		assert.deepEqual(parseHostLogFilename("proxy-host", "proxy-host-5_access.log"), {
			stem: "5",
			kind: "access",
			suffix: "",
		});
		assert.deepEqual(parseHostLogFilename("proxy-host", "proxy-host-5.app_access.log.1"), {
			stem: "5.app",
			kind: "access",
			suffix: ".1",
		});
		assert.deepEqual(parseHostLogFilename("proxy-host", "proxy-host-5_error.log.2.gz"), {
			stem: "5",
			kind: "error",
			suffix: ".2.gz",
		});
	});

	it("returns null for unrelated names", () => {
		assert.equal(parseHostLogFilename("proxy-host", "default-host_access.log"), null);
		assert.equal(parseHostLogFilename("proxy-host", "proxy-host-5.json"), null);
	});
});

describe("listStaleLogFilesForHost", () => {
	it("lists stale stems and rotation files; excludes current stem and other host ids", () => {
		const dir = mkTempLogsDir();
		const host = { id: 5, domain_names: ["keep.example.com"] };
		const current = getNginxFileStem("proxy_host", host);

		fs.writeFileSync(path.join(dir, `proxy-host-${current}_access.log`), "");
		fs.writeFileSync(path.join(dir, "proxy-host-5_access.log"), "");
		fs.writeFileSync(path.join(dir, "proxy-host-5_access.log.1"), "");
		fs.writeFileSync(path.join(dir, "proxy-host-51_access.log"), "");

		const stale = listStaleLogFilesForHost(dir, "proxy_host", host);
		const stems = new Set(stale.map((e) => e.stem));
		assert.ok(stems.has("5"));
		assert.ok(!stems.has("51"));
		assert.equal(stale.filter((e) => e.suffix === ".1").length, 1);
	});

	it("returns empty when log dir is missing", () => {
		const stale = listStaleLogFilesForHost("/nonexistent/npm-logs-xyz", "proxy_host", {
			id: 1,
			domain_names: [],
		});
		assert.equal(stale.length, 0);
	});
});

describe("renameStaleLogsToCurrent", () => {
	it("renames a single stale stem family onto the canonical stem", () => {
		const dir = mkTempLogsDir();
		const host = { id: 7, domain_names: ["new.example.org"] };
		const canon = getNginxFileStem("proxy_host", host);

		fs.writeFileSync(path.join(dir, "proxy-host-7_access.log"), "a");
		fs.writeFileSync(path.join(dir, "proxy-host-7_access.log.1"), "b");
		fs.writeFileSync(path.join(dir, "proxy-host-7_error.log"), "c");

		const r = renameStaleLogsToCurrent(dir, "proxy_host", host, { dryRun: false });
		assert.equal(r.renamed.length, 3);
		assert.equal(r.deleted.length, 0);

		assert.ok(fs.existsSync(path.join(dir, `proxy-host-${canon}_access.log`)));
		assert.ok(fs.existsSync(path.join(dir, `proxy-host-${canon}_access.log.1`)));
		assert.ok(fs.existsSync(path.join(dir, `proxy-host-${canon}_error.log`)));
		assert.equal(fs.readFileSync(path.join(dir, `proxy-host-${canon}_access.log`), "utf8"), "a");
	});

	it("with multiple stale stems, keeps newest by mtime and deletes older stems", () => {
		const dir = mkTempLogsDir();
		const host = { id: 4, domain_names: ["zzz.example.net"] };
		const canon = getNginxFileStem("proxy_host", host);
		assert.equal(canon, "4.zzz.example.net");

		const oldStemPath = path.join(dir, "proxy-host-4_access.log");
		const newerStalePath = path.join(dir, "proxy-host-4.prev.example.net_access.log");
		fs.writeFileSync(oldStemPath, "older-stem");
		fs.writeFileSync(newerStalePath, "newer-stem");
		const tOld = new Date("2020-01-01T00:00:00Z");
		const tNew = new Date("2024-06-01T00:00:00Z");
		fs.utimesSync(oldStemPath, tOld, tOld);
		fs.utimesSync(newerStalePath, tNew, tNew);

		const r = renameStaleLogsToCurrent(dir, "proxy_host", host, { dryRun: false });
		assert.ok(r.deleted.some((p) => p.endsWith("proxy-host-4_access.log")));
		assert.ok(r.renamed.some(({ to }) => to === path.join(dir, `proxy-host-${canon}_access.log`)));
		assert.ok(!fs.existsSync(oldStemPath));
		assert.ok(!fs.existsSync(newerStalePath));
		assert.ok(fs.existsSync(path.join(dir, `proxy-host-${canon}_access.log`)));
		assert.equal(fs.readFileSync(path.join(dir, `proxy-host-${canon}_access.log`), "utf8"), "newer-stem");
	});

	it("dryRun does not rename or delete", () => {
		const dir = mkTempLogsDir();
		const host = { id: 9, domain_names: ["x.example"] };
		const p = path.join(dir, "proxy-host-9_access.log");
		fs.writeFileSync(p, "z");

		const before = fs.statSync(p).mtimeMs;
		const r = renameStaleLogsToCurrent(dir, "proxy_host", host, { dryRun: true });
		assert.ok(r.renamed.length > 0);
		assert.equal(fs.statSync(p).mtimeMs, before);
		assert.ok(fs.existsSync(p));
	});

	it("skips rename when destination already exists with content", () => {
		const dir = mkTempLogsDir();
		const host = { id: 3, domain_names: ["d.example"] };
		const canon = getNginxFileStem("proxy_host", host);
		const dest = path.join(dir, `proxy-host-${canon}_access.log`);
		const src = path.join(dir, "proxy-host-3_access.log");
		fs.writeFileSync(dest, "dest");
		fs.writeFileSync(src, "src");

		const r = renameStaleLogsToCurrent(dir, "proxy_host", host, { dryRun: false });
		assert.ok(r.skipped.some((s) => s.reason === "target_exists_nonempty"));
		assert.equal(fs.readFileSync(dest, "utf8"), "dest");
		assert.ok(fs.existsSync(src));
	});

	it("removes empty destination placeholder then renames (nginx may create the new path first)", () => {
		const dir = mkTempLogsDir();
		const host = { id: 3, domain_names: ["d.example"] };
		const canon = getNginxFileStem("proxy_host", host);
		const dest = path.join(dir, `proxy-host-${canon}_access.log`);
		const src = path.join(dir, "proxy-host-3_access.log");
		fs.writeFileSync(dest, "");
		fs.writeFileSync(src, "migrated");

		const r = renameStaleLogsToCurrent(dir, "proxy_host", host, { dryRun: false });
		assert.equal(r.skipped.length, 0);
		assert.ok(r.renamed.some(({ to }) => to === dest));
		assert.equal(fs.readFileSync(dest, "utf8"), "migrated");
		assert.ok(!fs.existsSync(src));
	});
});
