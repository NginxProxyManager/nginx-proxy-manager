import net from "node:net";

/**
 * An IPv6 literal must be wrapped in square brackets before nginx appends
 * ":<port>". Otherwise proxy_pass is rejected with "invalid port in upstream".
 * Hostnames, IPv4 addresses, and values that are already bracketed are unchanged.
 *
 * @param {string} host
 * @returns {string}
 */
export function formatUpstreamHost(host) {
	if (typeof host === "string" && net.isIPv6(host)) {
		return `[${host}]`;
	}
	return host;
}

/**
 * Split an optional path suffix off a custom-location forward host, then
 * bracket an IPv6 address. `forward_path` is omitted when the host has no slash.
 *
 * @param {string} forwardHost
 * @returns {{forward_host: string, forward_path?: string}}
 */
export function prepareLocationForward(forwardHost) {
	let host = forwardHost;
	let forwardPath;
	if (host.indexOf("/") > -1) {
		const splitted = host.split("/");
		host = splitted.shift();
		forwardPath = `/${splitted.join("/")}`;
	}
	return {
		forward_host: formatUpstreamHost(host),
		forward_path: forwardPath,
	};
}
