import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROXY_DIRECTIVE_CATALOG } from "../internal/nginx-proxy-directive-catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = join(root, "frontend/src/generated/proxyDirectiveCatalog.ts");
const publicEntry = ({ managedDirectives: _managedDirectives, contexts: _contexts, ...entry }) => entry;
const output = `// Generated from backend/config/proxy-directive-catalog.json. Do not edit by hand.\nexport const PROXY_DIRECTIVE_CATALOG = ${JSON.stringify(
	{
		schemaVersion: PROXY_DIRECTIVE_CATALOG.schemaVersion,
		profileVersion: PROXY_DIRECTIVE_CATALOG.profileVersion,
		defaultLocationEnabled: PROXY_DIRECTIVE_CATALOG.defaultLocationEnabled,
		directives: PROXY_DIRECTIVE_CATALOG.directives.map(publicEntry),
	},
	null,
	2,
)} as const;\n`;
const check = process.argv.includes("--check");
if (check) {
	const current = await fs.readFile(outputPath, "utf8").catch(() => "");
	if (current !== output) {
		console.error("Generated proxy directive catalog is stale. Run npm run generate:proxy-directives.");
		process.exit(1);
	}
} else {
	await fs.mkdir(dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, output);
}
