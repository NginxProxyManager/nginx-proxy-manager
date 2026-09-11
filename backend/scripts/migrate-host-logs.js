#!/usr/bin/env node
/**
 * Renames or removes stale per-host nginx log files under /data/logs when the canonical
 * log stem (from the DB) no longer matches on-disk names. See lib/nginx_host_logs.js.
 *
 * Usage:
 *   node scripts/migrate-host-logs.js [--dry-run] [--yes]
 * Env:
 *   NPM_LOG_DIR  override log directory (default /data/logs)
 *
 * Host saves already rename stale logs after nginx config writes; use this for a full sweep without touching each host.
 */

import * as process from "node:process";
import { global as logger } from "../logger.js";
import { DEFAULT_LOG_DIR, renameStaleLogsToCurrent } from "../lib/nginx_host_logs.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const UNATTENDED = args.includes("-y") || args.includes("--yes");
const LOG_DIR = process.env.NPM_LOG_DIR || DEFAULT_LOG_DIR;

if (args.includes("--help") || args.includes("-h")) {
	console.log(`
Migrate stale nginx access/error logs for proxy, redirection, dead, and stream hosts.

  --dry-run   Print actions only; do not delete or rename files
  -y, --yes   Skip confirmation
  NPM_LOG_DIR Log directory (default: ${DEFAULT_LOG_DIR})

Example:
  node scripts/migrate-host-logs.js --dry-run
  node scripts/migrate-host-logs.js -y
`);
	process.exit(0);
}

const logIt = (msg, type = "info") => logger[type](`${DRY_RUN ? "[DRY RUN] " : ""}${msg}`);

if (!DRY_RUN && !UNATTENDED) {
	const readline = await import("node:readline");
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	const answer = await new Promise((resolve) => {
		rl.question(
			"This will rename/delete log files under " + LOG_DIR + " to match current host stems.\nProceed? (y/N) ",
			resolve,
		);
	});
	rl.close();
	if (String(answer).toLowerCase() !== "y") {
		console.log("Aborting.");
		process.exit(0);
	}
}

let totalRenamed = 0;
let totalDeleted = 0;
let totalSkipped = 0;

const processModel = async (model, niceType, label) => {
	const rows = await model
		.query()
		.where("is_deleted", 0)
		.groupBy("id")
		.allowGraph(model.defaultAllowGraph)
		.withGraphFetched(`[${model.defaultExpand.join(", ")}]`)
		.orderBy(...model.defaultOrder);

	logIt(`[${label}] Processing ${rows.length} hosts...`);

	for (const row of rows) {
		const result = renameStaleLogsToCurrent(LOG_DIR, niceType, row, { dryRun: DRY_RUN });
		totalRenamed += result.renamed.length;
		totalDeleted += result.deleted.length;
		totalSkipped += result.skipped.length;

		if (result.renamed.length || result.deleted.length || result.skipped.length) {
			logIt(
				`[${label}] host #${row.id}: renamed=${result.renamed.length} deleted=${result.deleted.length} skipped=${result.skipped.length}`,
			);
		}
	}
};

await processModel(proxyHostModel, "proxy_host", "proxy");
await processModel(redirectionHostModel, "redirection_host", "redirection");
await processModel(deadHostModel, "dead_host", "dead");
await processModel(streamModel, "stream", "stream");

logIt(`Done. renamed=${totalRenamed} deleted=${totalDeleted} skipped=${totalSkipped}`, "success");
process.exit(0);
