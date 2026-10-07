function parsePort(env, name, fallback) {
	const value = env[name];
	if (value === undefined) return fallback;
	const port = Number(value);
	if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`${name} must be an integer between 1 and 65535`);
	}
	return port;
}

export function getPublicPorts(env = process.env) {
	return {
		http: parsePort(env, "PUBLIC_HTTP_PORT", 80),
		https: parsePort(env, "PUBLIC_HTTPS_PORT", 443),
	};
}

export function renderPublicPortsConfig(ports) {
	const suffix = ports.https === 443 ? "" : `:${ports.https}`;
	return [
		"# Generated from PUBLIC_HTTP_PORT / PUBLIC_HTTPS_PORT at container startup.",
		"map $host $npm_public_https_port_suffix {",
		`\tdefault "${suffix}";`,
		"}",
		...(ports.https === 443 ? [] : ["error_page 497 =307 https://$host$npm_public_https_port_suffix$request_uri;"]),
		"",
	].join("\n");
}
