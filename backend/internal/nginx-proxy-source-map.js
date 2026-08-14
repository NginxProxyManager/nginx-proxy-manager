import { PROXY_DIRECTIVE_ENTRIES } from "./nginx-proxy-directive-catalog.js";

const directiveFields = new Map();
for (const entry of PROXY_DIRECTIVE_ENTRIES) {
	for (const directive of entry.managedDirectives || []) {
		if (!directiveFields.has(directive)) directiveFields.set(directive, entry.key);
	}
}
const systemDirectives = new Set([
	"listen", "server_name", "set", "access_log", "error_log", "ssl_certificate", "ssl_certificate_key",
	"ssl_session_cache", "ssl_session_timeout", "ssl_protocols", "ssl_ciphers", "ssl_prefer_server_ciphers",
	"return", "allow", "deny", "satisfy", "auth_basic", "auth_basic_user_file", "auth_request", "root",
	"default_type", "proxy_pass", "http2", "include",
]);
const cacheDirectives = new Set([
	"if_modified_since", "proxy_cache", "proxy_cache_key", "proxy_cache_valid", "proxy_cache_bypass", "proxy_no_cache",
	"proxy_cache_use_stale", "expires",
]);

const locationPathFromHeader = (trimmed) => {
	const match = trimmed.match(/^location\s+(?:\^~\s+|=\s+|~\*?\s+)?(?:"([^"]+)"|([^\s{]+))\s*\{/);
	return match?.[1] ?? match?.[2] ?? null;
};
const featureMarker = (trimmed) => trimmed.match(/^# npm:feature field=([^\s]+) source=([^\s]+) (begin|end|value=off)$/);
const featureFrontendFields = {
	caching_enabled: "cachingEnabled",
	allow_websocket_upgrade: "allowWebsocketUpgrade",
	block_exploits: "blockExploits",
	certificate_id: "certificateId",
	ssl_forced: "sslForced",
	hsts_enabled: "hstsEnabled",
	access_list_id: "accessListId",
	monitoring_logs: null,
};
const featureFrontendField = (field) =>
	Object.hasOwn(featureFrontendFields, field) ? featureFrontendFields[field] : field;

export const buildProxySourceMap = (config, effective) => {
	const result = [];
	const lines = String(config).split("\n");
	let depth = 0;
	let location = null;
	let locationDepth = null;
	const features = [];
	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (!trimmed) continue;
		const marker = featureMarker(trimmed);
		if (marker) {
			const [, field, source, state] = marker;
			result.push({ line_start: index + 1, line_end: index + 1, directive: null, field: `feature.${field}`, frontend_field: featureFrontendField(field), source, scope: location ? "location" : "server", location_id: location?.location_id ?? null, path: location?.path ?? null });
			if (state === "begin") features.push({ field, source });
			else if (state === "end") features.pop();
			continue;
		}
		if (trimmed.startsWith("#")) continue;
		const path = locationPathFromHeader(trimmed);
		if (path !== null) {
			location = effective.locations.find((item) => item.path === path) ?? (path === "/" ? { ...effective.server, path: "/", location_id: null } : { path, location_id: null, sources: {} });
			locationDepth = depth + 1;
		}
		const directive = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1]?.toLowerCase();
		if (directive && !["location", "server", "if", "map"].includes(directive)) {
			const feature = features.at(-1);
			const optionValues = location?.effective_flat ?? effective.server.effective_flat;
			let field = directiveFields.get(directive) ?? null;
			let sourceRecord = field ? location?.sources?.[field] ?? effective.server.sources[field] : null;
			const headerName = trimmed.match(/^(?:proxy_set_header|proxy_hide_header)\s+([^\s;]+)/i)?.[1];
			const requestHeaderRule =
				directive === "proxy_set_header" && headerName
					? optionValues?.request_headers?.find((item) => item.name.toLowerCase() === headerName.toLowerCase())
					: null;
			const responseHeaderRule =
				directive === "proxy_hide_header" && headerName
					? optionValues?.response_headers?.find(
							(item) =>
								item.name.toLowerCase() === headerName.toLowerCase() &&
								["set", "remove"].includes(item.operation),
						)
					: null;
			if (requestHeaderRule) {
				field = "request_headers";
				sourceRecord = location?.sources?.[field] ?? effective.server.sources[field];
			} else if (responseHeaderRule) {
				field = "response_headers";
				sourceRecord = location?.sources?.[field] ?? effective.server.sources[field];
			} else if (directive === "proxy_hide_header") {
				field = "hide_response_headers";
				sourceRecord = location?.sources?.[field] ?? effective.server.sources[field];
			} else if (directive === "access_log" || directive === "error_log") {
				field = "feature.monitoring_logs";
				sourceRecord = { frontend_field: null, source: "system" };
			} else if (directive === "proxy_set_header" && /\s(?:Upgrade|Connection)\s/i.test(trimmed)) {
				field = "feature.allow_websocket_upgrade";
				sourceRecord = { frontend_field: "allowWebsocketUpgrade", source: "derived" };
			} else if (directive === "proxy_set_header" && /\s(?:Host|X-Forwarded-(?:Scheme|Proto|For)|X-Real-IP)\s/i.test(trimmed)) {
				const header = trimmed.match(/^proxy_set_header\s+([^\s;]+)/i)?.[1]?.toLowerCase() ?? "unknown";
				field = `system.proxy_request_header.${header}`;
				sourceRecord = { frontend_field: null, source: "derived" };
			} else if (directive === "add_header" && /\sX-Served-By\s/i.test(trimmed)) {
				field = "system.served_by_header";
				sourceRecord = { frontend_field: null, source: "system" };
			} else if (feature) {
				field = `feature.${feature.field}`;
				sourceRecord = { frontend_field: featureFrontendField(feature.field), source: feature.source };
			} else if (cacheDirectives.has(directive)) {
				field = "feature.caching_enabled";
				sourceRecord = { frontend_field: "cachingEnabled", source: "derived" };
			}
			result.push({
				line_start: index + 1,
				line_end: index + 1,
				directive,
				field: field ?? (systemDirectives.has(directive) ? `system.${directive}` : `unmanaged.${directive}`),
				frontend_field: sourceRecord?.frontend_field ?? null,
				source: sourceRecord?.source ?? (systemDirectives.has(directive) ? "system" : "unmanaged"),
				scope: location ? "location" : "server",
				location_id: location?.location_id ?? null,
				path: location?.path ?? null,
			});
		}
		const opens = (trimmed.match(/\{/g) || []).length;
		const closes = (trimmed.match(/}/g) || []).length;
		depth += opens - closes;
		if (location && locationDepth !== null && depth < locationDepth) {
			location = null;
			locationDepth = null;
		}
	}
	return result;
};

export default { buildProxySourceMap };
