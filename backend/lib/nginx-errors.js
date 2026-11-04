/**
 * Helpers to turn `nginx -t` output into something a user can act on.
 *
 * This module is intentionally free of database / model imports so it can be
 * unit tested with `node --test`.
 */

const MANAGED_FILE_REGEX = /^\/data\/nginx\/(proxy_host|redirection_host|dead_host|stream)\/(\d+)\.conf$/;

/**
 * Removes noise from nginx stderr output:
 * - the docker-ism alert about /var/log/nginx/error.log which is always a false positive
 * - the warning that the "user" directive is ignored, which nginx always prints when it runs as PUID
 * - the trailing "configuration file ... test failed" line
 *
 * @param   {String} output
 * @returns {String}
 */
const cleanNginxOutput = (output) => {
	return `${output || ""}`
		.split("\n")
		.filter((line) => line.indexOf("/var/log/nginx/error.log") === -1)
		.filter((line) => !/\[warn\] the "user" directive makes sense only if the master process runs with super-user privileges/.test(line))
		.filter((line) => !/configuration file .* test failed/.test(line))
		.filter((line) => line.trim() !== "")
		.join("\n")
		.trim();
};

/**
 * Finds the first real error in the `nginx -t` output.
 *
 * @param   {String} output  raw stderr of `nginx -t`
 * @returns {{file: String|null, line: Number|null, message: String, output: String}}
 */
const parseNginxTestOutput = (output) => {
	const cleaned = cleanNginxOutput(output);
	const lines = cleaned.split("\n");
	const errorLine =
		lines.find((line) => /\[(emerg|alert|crit|error)\]/.test(line)) ||
		lines.find((line) => line.trim() !== "" && !/syntax is ok/.test(line)) ||
		"";

	// "nginx: [emerg] msg" or "2026/11/04 10:00:00 [emerg] 12#12: msg"
	let message = errorLine
		.replace(/^.*?\[(emerg|alert|crit|error|warn)\]\s*(\d+#\d+:\s*)?/, "")
		.replace(/^nginx:\s*/, "");
	let file = null;
	let line = null;

	const match = message.match(/\s+in (\S+):(\d+)\s*$/);
	if (match) {
		file = match[1];
		line = Number.parseInt(match[2], 10);
		message = message.slice(0, match.index);
	}

	return {
		file,
		line,
		message: message.trim(),
		output: cleaned,
	};
};

/**
 * @param   {String} file
 * @returns {{host_type: String, host_id: Number}|null}
 */
const parseManagedFile = (file) => {
	const match = `${file || ""}`.match(MANAGED_FILE_REGEX);
	if (!match) {
		return null;
	}
	return {
		host_type: match[1],
		host_id: Number.parseInt(match[2], 10),
	};
};

const stripPort = (upstream) => {
	// [::1]:80 -> [::1], host:80 -> host
	if (upstream.startsWith("[")) {
		const end = upstream.indexOf("]");
		return end > -1 ? upstream.slice(0, end + 1) : upstream;
	}
	const parts = upstream.split(":");
	return parts.length === 2 ? parts[0] : upstream;
};

/**
 * Each rule turns a raw nginx message into a short sentence (without a trailing full stop)
 * plus an optional hint.
 */
const RULES = [
	{
		regex: /host not found in upstream "([^"]+)"/,
		text: (m) => `host "${stripPort(m[1])}" could not be resolved`,
		hint: "Check that the host name is spelled correctly, that the container or server is running, and that NPM can reach it on a shared network.",
	},
	{
		regex: /no resolver defined to resolve (\S+)/,
		text: (m) => `no DNS resolver is configured to resolve "${m[1]}"`,
		hint: "The nginx resolver is disabled (DISABLE_RESOLVER). Use an IP address or enable the resolver.",
	},
	{
		regex: /invalid port in upstream "([^"]+)"/,
		text: (m) => `invalid port in upstream "${m[1]}"`,
		hint: 'The port must be a number between 1 and 65535. A forward path must start with "/".',
	},
	{
		regex: /invalid URL prefix in "([^"]+)"/,
		text: (m) => `invalid URL "${m[1]}"`,
		hint: "Check the scheme and host of the upstream.",
	},
	{
		regex: /unknown directive "([^"]+)"/,
		text: (m) => `unknown directive "${m[1]}"`,
		hint: "Check the spelling of the directive. If it comes from an nginx module, that module may not be available.",
	},
	{
		regex: /unknown "([^"]+)" variable/,
		text: (m) => `unknown variable "$${m[1]}"`,
		hint: "Check the spelling of the variable, or define it with set or map.",
	},
	{
		regex: /invalid number of arguments in "([^"]+)" directive/,
		text: (m) => `wrong number of arguments for "${m[1]}"`,
		hint: "Check for a missing or extra value, or a missing semicolon at the end of the previous line.",
	},
	{
		regex: /"([^"]+)" directive is duplicate/,
		text: (m) => `"${m[1]}" is set more than once`,
		hint: "Remove the duplicate. NPM may already set this directive for you.",
	},
	{
		regex: /duplicate location "([^"]+)"/,
		text: (m) => `the location "${m[1]}" is defined more than once`,
		hint: "Each location path may only be used once per host, including locations in the advanced configuration.",
	},
	{
		regex: /unexpected "\}"/,
		text: () => 'unexpected "}"',
		hint: "Check that every { has a matching }.",
	},
	{
		regex: /unexpected "\{"/,
		text: () => 'unexpected "{"',
		hint: "Check that every { has a matching } and that the previous line ends with a semicolon.",
	},
	{
		regex: /unexpected ";"/,
		text: () => 'unexpected ";"',
		hint: "Check for a stray semicolon.",
	},
	{
		regex: /unexpected end of file, expecting "([^"]+)"/,
		text: (m) => `the configuration ends unexpectedly, a "${m[1]}" is missing`,
		hint: "Check for a missing semicolon or closing }.",
	},
	{
		regex: /"proxy_pass" cannot have URI part in location given by regular expression/,
		text: () => "a forward path can't be used with a regular-expression location",
		hint: "Remove the forward path or use a prefix location.",
	},
	{
		regex: /pcre2?_compile\(\) failed: (.+?)(?: in "[^"]*")?(?: at "[^"]*")?$/,
		text: (m) => `invalid regular expression (${m[1].trim()})`,
		hint: "Check the regular expression syntax of the location path or rewrite.",
	},
	{
		regex: /cannot load certificate(?: key)? "([^"]+)"/,
		text: (m) => `the certificate file "${m[1]}" could not be loaded`,
		hint: "The certificate may have been deleted or not issued yet. Select another certificate or renew it.",
	},
	{
		regex: /BIO_new_file\(\) failed/,
		text: () => "a certificate file could not be loaded",
		hint: "The certificate may have been deleted or not issued yet. Select another certificate or renew it.",
	},
	{
		regex: /no "ssl_certificate" is defined/,
		text: () => "SSL is enabled but no certificate is defined",
		hint: "Select a certificate for this host.",
	},
	{
		regex: /invalid parameter "([^"]+)"/,
		text: (m) => `invalid parameter "${m[1]}"`,
		hint: null,
	},
	{
		regex: /location "([^"]+)" cannot be inside the (exact|named) location "([^"]+)"/,
		text: (m) => `the location "${m[1]}" can't be placed inside the ${m[2]} location "${m[3]}"`,
		hint: "Exact (=) and named (@) locations can't contain other locations.",
	},
	{
		regex: /"location" directive is not allowed here/,
		text: () => 'a "location" block is not allowed here',
		hint: "Locations can only be placed in a server block or inside another location.",
	},
	{
		regex: /"([^"]+)" directive is not allowed here/,
		text: (m) => `the "${m[1]}" directive is not allowed here`,
		hint: "This directive can't be used in this context.",
	},
	{
		regex: /could not build server_names_hash|could not build map_hash/,
		text: () => "too many or too long domain names",
		hint: null,
	},
	{
		regex: /bind\(\) to (\S+) failed/,
		text: (m) => `the address ${m[1]} is already in use`,
		hint: "Another host or service already listens on this port.",
	},
];

/**
 * @param   {String} message  nginx message without the "nginx: [emerg]" prefix and without the "in file:line" suffix
 * @returns {{text: String, hint: String|null}}
 */
const humaniseNginxMessage = (message) => {
	const msg = `${message || ""}`.trim();
	for (const rule of RULES) {
		const match = msg.match(rule.regex);
		if (match) {
			return { text: rule.text(match), hint: rule.hint };
		}
	}
	return { text: msg || "nginx rejected the configuration", hint: null };
};

const capitalise = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : str);

const sentence = (str) => {
	const s = `${str || ""}`.trim();
	return /[.!?]$/.test(s) ? s : `${s}.`;
};

/**
 * @param   {Object}  meta  host meta written by configure
 * @returns {boolean} true when the host is offline because an upstream name did not resolve, or a custom
 *                    location is unresolved. Both can fix themselves once the upstream container is up.
 */
const mayResolveLater = (meta) => {
	if (meta?.nginx_online === false) {
		const text = `${meta.nginx_details?.nginx_output || ""} ${meta.nginx_err || ""}`;
		return /host not found in upstream/i.test(text);
	}
	return Array.isArray(meta?.nginx_locations) && meta.nginx_locations.some((loc) => loc?.status === "unresolved");
};

export {
	capitalise,
	cleanNginxOutput,
	humaniseNginxMessage,
	MANAGED_FILE_REGEX,
	mayResolveLater,
	parseManagedFile,
	parseNginxTestOutput,
	sentence,
};
