import net from "node:net";
import errs from "./error.js";

const hostnameLabel = /^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?$/;

// Nginx compares upstream names without case sensitivity. Store one spelling so
// the unique database constraint behaves consistently across supported databases.
export const normalizeUpstreamName = (name) => {
	if (name === undefined || name === null || name === "") return null;
	if (
		typeof name !== "string" ||
		name.length > 128 ||
		!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) ||
		/\s/.test(name) ||
		/^npm-/i.test(name)
	) {
		throw new errs.ValidationError(
			"Upstream name must start with a letter or underscore, contain only letters, digits, underscores or hyphens, be at most 128 characters, and not start with npm-",
		);
	}
	return name.toLowerCase();
};

export const normalizeForwardingMode = (mode, servers) => {
	const effectiveMode = mode ?? (servers.length ? "upstream" : "direct");
	if (!["direct", "upstream"].includes(effectiveMode)) {
		throw new errs.ValidationError("Forwarding mode must be direct or upstream");
	}
	if (effectiveMode === "upstream" && !servers.length) {
		throw new errs.ValidationError("Upstream forwarding requires at least one server");
	}
	return effectiveMode;
};

export const normalizeUpstreamServers = (servers, method = "round_robin") => {
	const normalizedServers = servers.map((server) => {
		const host = server.host;
		const address = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
		const isAddress = net.isIP(host) > 0 || (host.startsWith("[") && host.endsWith("]") && net.isIPv6(address));
		const isHostname =
			host.length <= 253 &&
			host
				.replace(/\.$/, "")
				.split(".")
				.every((label) => hostnameLabel.test(label));
		if (/\s/.test(host) || (!isAddress && !isHostname)) {
			throw new errs.ValidationError("Upstream host must be an IP address or hostname");
		}
		const normalized = {
			weight: 1,
			max_fails: 1,
			fail_timeout: "30s",
			backup: false,
			down: false,
			...server,
		};
		if (
			!/^(?:0|[1-9][0-9]*[smhd]?)$/.test(normalized.fail_timeout) ||
			normalized.fail_timeout.length > 12 ||
			/\s/.test(normalized.fail_timeout)
		) {
			throw new errs.ValidationError("Upstream fail timeout must use whole seconds, minutes, hours or days");
		}
		for (const [field, minimum] of [
			["weight", 1],
			["max_fails", 0],
		]) {
			if (!Number.isInteger(normalized[field]) || normalized[field] < minimum || normalized[field] > 2147483647) {
				throw new errs.ValidationError(
					`Upstream ${field} must be an integer between ${minimum} and 2147483647`,
				);
			}
		}
		if (method === "ip_hash" && normalized.backup) {
			throw new errs.ValidationError(
				"The backup parameter cannot be used with the ip_hash load balancing method",
			);
		}
		return normalized;
	});

	if (normalizedServers.length && normalizedServers.every((server) => server.backup)) {
		throw new errs.ValidationError("An upstream group must contain at least one non-backup server");
	}
	return normalizedServers;
};

export const prepareUpstreamServers = (servers) =>
	normalizeUpstreamServers(servers).map((server) => ({
		...server,
		host: net.isIPv6(server.host) ? `[${server.host}]` : server.host,
		resolve: net.isIP(server.host.replace(/^\[|\]$/g, "")) === 0,
	}));
