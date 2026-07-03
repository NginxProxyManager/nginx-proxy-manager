#!/usr/bin/env node
/**
 * Dereference backend/schema/swagger.json into docs/src/public/openapi.json
 * for static VitePress API reference (Redoc + Swagger UI).
 * Uses a small built-in $ref resolver (no extra npm deps required for generation).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(__dirname, "..");
const REPO_ROOT = process.env.NPM_REPO_ROOT
	? join(process.env.NPM_REPO_ROOT)
	: join(DOCS_ROOT, "..");
const SCHEMA_DIR = join(REPO_ROOT, "backend", "schema");
const SCHEMA_PATH = join(SCHEMA_DIR, "swagger.json");
const OUT_PATH = join(DOCS_ROOT, "src", "public", "openapi.json");
const VERSION_FILE = join(REPO_ROOT, ".version");

const loadVersion = () => {
	try {
		const v = readFileSync(VERSION_FILE, "utf8").trim().replace(/^v/, "");
		if (/^\d+\.\d+\.\d+$/.test(v)) return v;
	} catch {
		// fall through
	}
	const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "backend", "package.json"), "utf8"));
	return pkg.version || "0.0.0";
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const fileCache = new Map();

const loadFileRef = (refPath, baseDir) => {
	const resolved = join(baseDir, refPath);
	if (!fileCache.has(resolved)) {
		const doc = readJson(resolved);
		fileCache.set(resolved, doc);
	}
	return fileCache.get(resolved);
};

const resolvePointer = (root, pointer) => {
	const parts = pointer.replace(/^#\//, "").split("/");
	let node = root;
	for (const part of parts) {
		if (node === undefined || node === null) {
			throw new Error(`Invalid JSON pointer: ${pointer}`);
		}
		node = node[part.replace(/~1/g, "/").replace(/~0/g, "~")];
	}
	return node;
};

const deref = (value, baseDir, document, stack = new Set()) => {
	if (value === null || typeof value !== "object") {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => deref(item, baseDir, document, stack));
	}

	if (typeof value.$ref === "string") {
		const ref = value.$ref;
		if (stack.has(ref)) {
			throw new Error(`Circular $ref: ${ref}`);
		}
		stack.add(ref);

		let target;
		let nextBaseDir = baseDir;
		let nextDocument = document;

		if (ref.startsWith("#/")) {
			target = resolvePointer(document, ref);
		} else if (ref.startsWith("./") || ref.startsWith("../")) {
			const hashIndex = ref.indexOf("#");
			const filePart = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
			const hashPart = hashIndex >= 0 ? ref.slice(hashIndex) : null;
			const resolvedFile = join(baseDir, filePart);
			nextBaseDir = dirname(resolvedFile);
			const fileDoc = loadFileRef(filePart, baseDir);
			nextDocument = fileDoc;
			target = hashPart ? resolvePointer(fileDoc, hashPart) : fileDoc;
		} else {
			throw new Error(`Unsupported $ref: ${ref}`);
		}

		const resolved = deref(structuredClone(target), nextBaseDir, nextDocument, stack);
		stack.delete(ref);
		return resolved;
	}

	const out = {};
	for (const [key, child] of Object.entries(value)) {
		out[key] = deref(child, baseDir, document, stack);
	}
	return out;
};

const main = () => {
	const root = readJson(SCHEMA_PATH);
	const spec = deref(root, SCHEMA_DIR, root);

	spec.info = spec.info || {};
	spec.info.version = loadVersion();
	spec.servers = [{ url: "/api", description: "NPM API (relative to docs site origin)" }];

	if (!spec.paths || typeof spec.paths !== "object") {
		throw new Error("OpenAPI spec missing paths after dereference");
	}

	mkdirSync(dirname(OUT_PATH), { recursive: true });
	writeFileSync(OUT_PATH, `${JSON.stringify(spec, null, "\t")}\n`, "utf8");
	console.log(`Wrote ${OUT_PATH} (${Object.keys(spec.paths).length} paths, v${spec.info.version})`);
};

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
