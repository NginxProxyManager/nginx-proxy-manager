import fs from "node:fs";
import { fileURLToPath } from "node:url";

const catalogPath = fileURLToPath(new URL("../config/proxy-directive-catalog.json", import.meta.url));
const rawCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const requiredEntryKeys = new Set([
	"key",
	"frontendKey",
	"directive",
	"category",
	"storage",
	"contexts",
	"valueType",
	"profileValue",
	"emitPolicy",
	"inheritPolicy",
	"minVersion",
	"modules",
	"order",
	"helpKey",
	"managedDirectives",
]);

const assertCatalog = (catalog) => {
	if (!catalog || catalog.schemaVersion !== 1 || typeof catalog.profileVersion !== "string")
		throw new Error("Invalid proxy directive catalog header");
	if (!Array.isArray(catalog.directives) || !catalog.directives.length)
		throw new Error("Proxy directive catalog must contain directives");
	const keys = new Set();
	const frontendKeys = new Set();
	const orders = new Set();
	for (const entry of catalog.directives) {
		for (const key of requiredEntryKeys) {
			if (!(key in entry)) throw new Error(`Proxy directive catalog entry ${entry.key || "<unknown>"} is missing ${key}`);
		}
		if (keys.has(entry.key)) throw new Error(`Duplicate proxy directive key ${entry.key}`);
		if (frontendKeys.has(entry.frontendKey)) throw new Error(`Duplicate proxy directive frontendKey ${entry.frontendKey}`);
		if (orders.has(entry.order)) throw new Error(`Duplicate proxy directive order ${entry.order}`);
		if (!entry.storage || !["directives", "headers"].includes(entry.storage.section))
			throw new Error(`Invalid storage section for ${entry.key}`);
		keys.add(entry.key);
		frontendKeys.add(entry.frontendKey);
		orders.add(entry.order);
	}
	return catalog;
};

export const PROXY_DIRECTIVE_CATALOG = Object.freeze(assertCatalog(rawCatalog));
export const PROXY_DIRECTIVE_ENTRIES = Object.freeze(
	[...PROXY_DIRECTIVE_CATALOG.directives].sort((left, right) => left.order - right.order),
);
export const PROXY_DIRECTIVE_BY_KEY = Object.freeze(
	Object.fromEntries(PROXY_DIRECTIVE_ENTRIES.map((entry) => [entry.key, entry])),
);
export const PROXY_MANAGED_DIRECTIVES = Object.freeze(
	[...new Set(PROXY_DIRECTIVE_ENTRIES.flatMap((entry) => entry.managedDirectives).filter(Boolean))].sort(),
);
export const PROXY_DIRECTIVE_CATALOG_PATH = catalogPath;

export const compareNginxVersions = (left, right) => {
	const parts = (value) => String(value || "0").match(/\d+/g)?.map(Number) ?? [0];
	const a = parts(left);
	const b = parts(right);
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const difference = (a[index] || 0) - (b[index] || 0);
		if (difference) return difference < 0 ? -1 : 1;
	}
	return 0;
};

export const validateCatalogCapability = (capability) => {
	const diagnostics = [];
	for (const entry of PROXY_DIRECTIVE_ENTRIES) {
		if (entry.minVersion && compareNginxVersions(capability.nginx_version, entry.minVersion) < 0) {
			diagnostics.push({
				severity: "error",
				code: "NGINX_DIRECTIVE_UNSUPPORTED_VERSION",
				field: entry.key,
				message: `${entry.directive || entry.key} requires nginx ${entry.minVersion} or newer; capability profile reports ${capability.nginx_version}`,
			});
		}
		for (const moduleName of entry.modules || []) {
			if (!capability.modules.includes(moduleName)) {
				diagnostics.push({
					severity: "error",
					code: "NGINX_DIRECTIVE_MODULE_UNAVAILABLE",
					field: entry.key,
					message: `${entry.directive || entry.key} requires capability module ${moduleName}`,
				});
			}
		}
	}
	return diagnostics;
};

export default {
	PROXY_DIRECTIVE_CATALOG,
	PROXY_DIRECTIVE_ENTRIES,
	PROXY_DIRECTIVE_BY_KEY,
	PROXY_MANAGED_DIRECTIVES,
	compareNginxVersions,
	validateCatalogCapability,
};
