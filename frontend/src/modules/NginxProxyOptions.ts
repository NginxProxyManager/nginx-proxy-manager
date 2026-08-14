import type { NginxOptionSections, NginxOptions } from "src/api/backend";
import { PROXY_DIRECTIVE_CATALOG } from "src/generated/proxyDirectiveCatalog";

export const PROXY_OPTION_PROFILE_VERSION = PROXY_DIRECTIVE_CATALOG.profileVersion;

const OPTIONAL_INTEGER_FIELDS = [
	"proxyHeadersHashBucketSize",
	"proxyHeadersHashMaxSize",
	"proxyNextUpstreamTries",
	"proxySslVerifyDepth",
] as const;

const INPUT_LIST_FIELDS = [
	["hideResponseHeadersInput", "hideResponseHeaders"],
	["proxyPassHeadersInput", "proxyPassHeaders"],
] as const;

/**
 * Converts form-only values into the canonical flat option shape used by the API.
 * Empty comma-separated header inputs intentionally become [] so a Location can
 * explicitly clear an inherited list instead of silently dropping the override.
 */
export const normalizeProxyOptionsForApi = (options: Record<string, any> = {}): NginxOptions => {
	const result: Record<string, any> = { ...options };
	for (const key of OPTIONAL_INTEGER_FIELDS) {
		if (result[key] === "" || typeof result[key] === "undefined") delete result[key];
		else result[key] = Number(result[key]);
	}
	if (Array.isArray(result.proxyBuffers)) {
		const [count, size] = result.proxyBuffers;
		if (count === "" || typeof count === "undefined" || !size) delete result.proxyBuffers;
		else result.proxyBuffers = [Number(count), size];
	}
	for (const [inputKey, targetKey] of INPUT_LIST_FIELDS) {
		if (typeof result[inputKey] === "string") {
			result[targetKey] = result[inputKey]
				.split(",")
				.map((value: string) => value.trim())
				.filter(Boolean);
		}
		delete result[inputKey];
	}
	for (const key of ["proxyNextUpstream", "proxySslProtocols"]) {
		if (Array.isArray(result[key]) && result[key].length === 0) delete result[key];
	}
	for (const key of Object.keys(result)) {
		if (result[key] === "") delete result[key];
	}
	return result as NginxOptions;
};

const FORM_FIELD_TO_OPTION_KEY: Record<string, string> = {
	hideResponseHeadersInput: "hideResponseHeaders",
	proxyPassHeadersInput: "proxyPassHeaders",
};

export const proxyOptionKeyFromFieldName = (rootName: string, fieldName: string): string | null => {
	const prefix = `${rootName}.`;
	if (!fieldName.startsWith(prefix)) return null;
	const formKey = fieldName.slice(prefix.length).split(".")[0];
	return FORM_FIELD_TO_OPTION_KEY[formKey] || formKey || null;
};

export const appendProxyOverrideKey = (keys: unknown, key: string): string[] => {
	const current = Array.isArray(keys) ? keys.filter((value): value is string => typeof value === "string") : [];
	return current.includes(key) ? current : [...current, key];
};

const frontendStorageKey = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

export const DEFAULT_PROXY_LOCATION_OPTIONS = Object.fromEntries(
	PROXY_DIRECTIVE_CATALOG.directives.map((entry) => [entry.frontendKey, structuredClone(entry.profileValue)]),
) as NginxOptions;

export const materializeProxyLocationOptions = (options: NginxOptions = {}): NginxOptions => ({
	...structuredClone(DEFAULT_PROXY_LOCATION_OPTIONS),
	...options,
});

export const materializeProxyServerOptions = (options: NginxOptions = {}): NginxOptions => ({
	defaultLocationEnabled: PROXY_DIRECTIVE_CATALOG.defaultLocationEnabled,
	...materializeProxyLocationOptions(options),
});

export const flattenProxyOptionSections = (sections?: NginxOptionSections | NginxOptions): NginxOptions => {
	if (!sections) return {};
	if (!("directives" in sections) && !("headers" in sections)) return { ...(sections as NginxOptions) };
	const result: Record<string, unknown> = { ...(sections.directives || {}) };
	for (const entry of PROXY_DIRECTIVE_CATALOG.directives) {
		if (entry.storage.section === "headers") {
			const key = frontendStorageKey(entry.storage.key) as keyof NonNullable<NginxOptionSections["headers"]>;
			const value = sections.headers?.[key];
			if (typeof value !== "undefined") result[entry.frontendKey] = value;
		}
	}
	return result as NginxOptions;
};

export const groupProxyOptions = (options: NginxOptions = {}): NginxOptionSections => {
	const directives: Record<string, unknown> = {};
	const headers: Record<string, unknown> = {};
	for (const entry of PROXY_DIRECTIVE_CATALOG.directives) {
		const value = options[entry.frontendKey as keyof NginxOptions];
		if (typeof value === "undefined") continue;
		if (entry.storage.section === "headers") headers[frontendStorageKey(entry.storage.key)] = value;
		else directives[entry.frontendKey] = value;
	}
	if (typeof options.defaultLocationEnabled !== "undefined")
		directives.defaultLocationEnabled = options.defaultLocationEnabled;
	return {
		directives: directives as NginxOptionSections["directives"],
		headers: headers as NginxOptionSections["headers"],
	};
};

export const diffProxyOptions = (effective: NginxOptions, inherited: NginxOptions): NginxOptions =>
	Object.fromEntries(
		Object.entries(effective).filter(
			([key, value]) => JSON.stringify(value) !== JSON.stringify(inherited[key as keyof NginxOptions]),
		),
	) as NginxOptions;
