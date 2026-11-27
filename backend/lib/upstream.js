import net from "node:net";

/**
 * Defaults for the optional upstream server fields. They match the defaults in
 * schema/components/upstream-server-object.json, which the API validator doesn't apply.
 */
export const UPSTREAM_SERVER_DEFAULTS = {
	weight: 1,
	max_fails: 1,
	fail_timeout: "30s",
	backup: false,
	down: false,
};

/**
 * Fills in the optional fields that API clients may leave out
 *
 * @param   {Array|null|undefined}  servers
 * @returns {Array}
 */
export const normalizeUpstreamServers = (servers) => {
	if (!Array.isArray(servers)) {
		return [];
	}
	return servers.map((server) => {
		const normalized = { ...UPSTREAM_SERVER_DEFAULTS };
		for (const [key, value] of Object.entries(server || {})) {
			if (typeof value !== "undefined" && value !== null) {
				normalized[key] = value;
			}
		}
		return normalized;
	});
};

/**
 * Prepares upstream servers for the proxy_host template
 *
 * nginx resolves host names in an upstream block when it loads its config, so a single host name
 * that doesn't resolve (e.g. a stopped container) would stop nginx from starting and take every
 * host down. Host names get the "resolve" parameter instead, so nginx resolves them at run time
 * with the resolver from resolvers.conf. That needs a resolver, so it's skipped when none is set.
 *
 * @param   {Array}    servers
 * @param   {Boolean}  hasResolver
 * @returns {Array}
 */
export const prepareUpstreamServers = (servers, hasResolver) => {
	return normalizeUpstreamServers(servers).map((server) => {
		const host = String(server.host).replace(/^\[(.*)\]$/, "$1");
		const ipVersion = net.isIP(host);
		return {
			...server,
			// An IPv6 address needs brackets before nginx appends ":<port>"
			host: ipVersion === 6 ? `[${host}]` : host,
			resolve: ipVersion === 0 && hasResolver,
		};
	});
};
