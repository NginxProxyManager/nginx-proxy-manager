const flags = [
	"enabled",
	"ssl_forced",
	"http2_support",
	"hsts_enabled",
	"hsts_subdomains",
	"block_exploits",
	"caching_enabled",
	"allow_websocket_upgrade",
	"satisfy_any",
	"pass_auth",
	"tcp_forwarding",
	"udp_forwarding",
];
const numbers = [
	"owner_user_id",
	"certificate_id",
	"access_list_id",
	"forward_port",
	"incoming_port",
	"forwarding_port",
];
const fields = new Set([
	...flags,
	...numbers,
	"name",
	"nice_name",
	"domain_names",
	"forward_host",
	"forwarding_host",
	"forward_scheme",
	"forward_domain_name",
	"forward_http_code",
	"provider",
	"advanced_config",
	"locations",
	"items",
	"clients",
	"meta",
]);

// Preserve which settings changed and safe typed values. Free text, nested
// configuration, certificate material and ACL credentials never enter PAT audit.
export const apiTokenAuditMeta = (meta, tokenId) => {
	const result = {
		api_token_id: tokenId,
		fields: Object.keys(meta || {})
			.filter((key) => fields.has(key))
			.sort(),
	};
	for (const key of flags) {
		if (typeof meta?.[key] === "boolean") result[key] = meta[key];
	}
	for (const key of numbers) {
		if (Number.isSafeInteger(meta?.[key]) && meta[key] >= 0) result[key] = meta[key];
	}
	if (["http", "https"].includes(meta?.forward_scheme)) result.forward_scheme = meta.forward_scheme;
	if (["other", "letsencrypt"].includes(meta?.provider)) result.provider = meta.provider;
	for (const key of ["locations", "items", "clients", "domain_names"]) {
		if (Array.isArray(meta?.[key])) result[`${key}_count`] = meta[key].length;
	}
	return result;
};
