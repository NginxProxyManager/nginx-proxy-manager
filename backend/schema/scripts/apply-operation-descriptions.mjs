#!/usr/bin/env node
/**
 * Add operation-level `description` to path fragment JSON files (Vacuum operation-description).
 * Run from repo root: node backend/schema/scripts/apply-operation-descriptions.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATHS_DIR = join(__dirname, "..", "paths");

/** operationId → operation description (min quality for Vacuum / Redoc) */
const DESCRIPTIONS = JSON.parse(
	readFileSync(join(__dirname, "operation-descriptions.json"), "utf8"),
);


const walk = (dir, files = []) => {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, files);
		else if (name.endsWith(".json")) files.push(p);
	}
	return files;
};

let updated = 0;
let skipped = 0;

for (const file of walk(PATHS_DIR)) {
	const raw = readFileSync(file, "utf8");
	const op = JSON.parse(raw);
	if (!op.operationId) {
		skipped++;
		continue;
	}
	const text = DESCRIPTIONS[op.operationId];
	if (!text) {
		console.warn(`No description mapping for ${op.operationId} in ${file}`);
		skipped++;
		continue;
	}
	if (op.description === text) {
		skipped++;
		continue;
	}
	const ordered = { ...op, description: text };
	const { operationId, summary, tags, security, description, ...rest } = ordered;
	const out = {
		operationId,
		summary,
		...(tags ? { tags } : {}),
		...(security ? { security } : {}),
		description,
		...rest,
	};
	writeFileSync(file, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	updated++;
}

console.log(`Updated ${updated} path files, skipped ${skipped}.`);
