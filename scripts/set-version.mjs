import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = path.join(root, ".version");
const packageFiles = ["backend/package.json", "frontend/package.json"];
const versionedTextFiles = [
	"README.md",
	"backend/schema/swagger.json",
	"backend/schema/components/check-version-object.json",
	"backend/schema/paths/version/check/get.json",
	"docs/src/advanced-config/index.md",
	"docs/src/guide/index.md",
	"docs/src/setup/index.md",
	"docs/src/upgrading/index.md",
];
const pattern = /^\d+\.\d+\.\d+$/;

const current = (await fs.readFile(versionFile, "utf8")).trim();
const requested = process.argv[2];

if (requested === "--check") {
	if (!pattern.test(current)) throw new Error(`Invalid .version value: ${current}`);
	for (const relativePath of packageFiles) {
		const pkg = JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
		if (pkg.version !== current) throw new Error(`${relativePath} has ${pkg.version}; expected ${current}`);
	}
	for (const relativePath of versionedTextFiles) {
		const content = await fs.readFile(path.join(root, relativePath), "utf8");
		if (!content.includes(current)) throw new Error(`${relativePath} does not reference current version ${current}`);
	}
	console.log(`Version sources are synchronized at ${current}`);
	process.exit(0);
}

if (!pattern.test(requested || "")) {
	console.error("Usage: node scripts/set-version.mjs <major.minor.patch> | --check");
	process.exit(1);
}

for (const relativePath of packageFiles) {
	const absolutePath = path.join(root, relativePath);
	const pkg = JSON.parse(await fs.readFile(absolutePath, "utf8"));
	pkg.version = requested;
	await fs.writeFile(absolutePath, `${JSON.stringify(pkg, null, "\t")}\n`);
}

for (const relativePath of versionedTextFiles) {
	const absolutePath = path.join(root, relativePath);
	const content = await fs.readFile(absolutePath, "utf8");
	await fs.writeFile(absolutePath, content.replaceAll(current, requested));
}

await fs.writeFile(versionFile, `${requested}\n`);
console.log(`Updated release version from ${current} to ${requested}`);
