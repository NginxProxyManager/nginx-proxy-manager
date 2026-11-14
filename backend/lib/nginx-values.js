import net from "node:net";
import errs from "./error.js";

/**
 * Rules for user-supplied values that the templates write into nginx config as-is.
 *
 * Anything that ends or changes an nginx token (whitespace, ";", "{", "}", quotes, "#" which
 * starts a comment, and "\" which escapes the next character) would let the value add its own
 * directives, which only admins may do (advanced_config). The API schema rejects these values
 * with the same patterns (a test keeps the two in step). generateConfig() checks stored values
 * again, so rows saved before these rules can't add directives either. That check is only about
 * nginx structure, not format: a stored value in a format the API no longer accepts, but which
 * can't add directives, still renders.
 *
 * Patterns are strings so they can be compared with the JSON schema; compile them with the "u"
 * flag, as ajv does.
 */

// One character that can't end or change an unquoted nginx token
const TOKEN_CHAR = String.raw`[^\s\p{Cc};{}"'#\\]`;
// Host part of a forward host: also no "$" (no variables in the upstream address) and no "/"
const HOST_CHARS = String.raw`[^\s\p{Cc};{}"'#\\$/]+`;
// The existing domain name rule ("a.b.c", no "*", no empty labels), written so it can't
// backtrack exponentially
const DOMAIN = String.raw`[^.*]+(?:\.[^.*]+)*\.?[^.]`;

export const patterns = {
	// server_name entries. The old character blacklist plus whitespace and control characters.
	domainName: "^[^&| @!#%^();:/\\\\}{=+?<>,~`'\"\\s\\p{Cc}]+$",
	// proxy_host forward_host and location forward_host: a host, optionally followed by a path
	// (locations split "host/path" at render time)
	forwardHost: String.raw`^${HOST_CHARS}(?:/${TOKEN_CHAR}*)?$`,
	// location forward_path, appended straight after the port
	forwardPath: String.raw`^${TOKEN_CHAR}*$`,
	// location path: an optional modifier, then one token, either unquoted (a "\" must escape a
	// visible character, so it can't swallow the space before "{") or double quoted. A modifier
	// on its own isn't a location.
	locationPath: String.raw`^(?!(?:=|~\*?|\^~)$)(?:(?:=|~\*?|\^~) +)?(?:"(?:[^"\\\p{Cc}]|\\[^\p{Cc}])+"|(?:[^\s\p{Cc};{}"'#\\]|\\[^\s\p{Cc}])+)$`,
	// redirection forward_domain_name, e.g. "example.com:8443/path"
	redirectDomain: String.raw`^(?=${TOKEN_CHAR}+$)${DOMAIN}$`,
	// stream forwarding_host when it is a domain name (IPs are matched separately)
	streamDomain: String.raw`^(?=${HOST_CHARS}$)${DOMAIN}$`,
	// access list client address: IPv6 with an optional prefix. No zone id ("%eth0"): nginx's
	// allow/deny rejects them, and the old "%.+" let anything through, including "; allow all"
	clientIpv6: String.raw`^(?:(?:[0-9A-Fa-f]{1,4}:){7}(?:[0-9A-Fa-f]{1,4}|:)|(?:[0-9A-Fa-f]{1,4}:){6}(?::[0-9A-Fa-f]{1,4}|(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:)|(?:[0-9A-Fa-f]{1,4}:){5}(?:(?::[0-9A-Fa-f]{1,4}){1,2}|:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:)|(?:[0-9A-Fa-f]{1,4}:){4}(?:(?::[0-9A-Fa-f]{1,4}){1,3}|(?::[0-9A-Fa-f]{1,4})?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:)|(?:[0-9A-Fa-f]{1,4}:){3}(?:(?::[0-9A-Fa-f]{1,4}){1,4}|(?::[0-9A-Fa-f]{1,4}){0,2}:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:)|(?:[0-9A-Fa-f]{1,4}:){2}(?:(?::[0-9A-Fa-f]{1,4}){1,5}|(?::[0-9A-Fa-f]{1,4}){0,3}:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:)|(?:[0-9A-Fa-f]{1,4}:)(?:(?::[0-9A-Fa-f]{1,4}){1,6}|(?::[0-9A-Fa-f]{1,4}){0,4}:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:)|:(?:(?::[0-9A-Fa-f]{1,4}){1,7}|(?::[0-9A-Fa-f]{1,4}){0,5}:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}|:))(?:/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?$`,
	// htpasswd user name: a ":" or a line break would corrupt the file
	accessUsername: String.raw`^[^:\p{Cc}]+$`,
};

const re = Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, new RegExp(v, "u")]));
const unsafeToken = /[\s\p{Cc};{}"'#\\]/u;
const ipv4WithPrefix = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:\/(?:[0-9]|[1-2][0-9]|3[0-2]))?$/;

export const isValid = (name, value) => typeof value === "string" && re[name].test(value);

export const isValidClientAddress = (value) =>
	typeof value === "string" && (value === "all" || ipv4WithPrefix.test(value) || re.clientIpv6.test(value));

export const isValidStreamHost = (value) =>
	typeof value === "string" && (net.isIP(value) !== 0 || re.streamDomain.test(value));

/**
 * Thrown when a stored value can't be written into nginx config safely
 *
 * @param {String} message
 * @param {Object} [what]        which value, for clients that word the message in their own language
 * @param {String} [what.field]  e.g. forward_host
 * @param {String} [what.value]  the value, quoted and shortened as in the message
 */
export const unsafeValueError = (message, what = null) => {
	const err = new errs.ConfigurationError(message);
	err.unsafeNginxValue = true;
	err.unsafeField = what?.field || null;
	err.unsafeValue = what?.value ?? null;
	return err;
};

// The field code of a value the message calls eg. "location forward host": location_forward_host
export const unsafeValueField = (what) => what.replace(/ /g, "_");

const describe = (value) => JSON.stringify(String(value)).slice(0, 80);

/**
 * @param   {String}  label    e.g. "Proxy Host #3"
 * @param   {Object}  [accessList]
 * @throws  {ConfigurationError}
 */
export const assertAccessListRenderable = (label, accessList) => {
	for (const client of accessList?.clients || []) {
		// "address" is rendered unquoted ("allow <address>;")
		if (typeof client.address !== "string" || unsafeToken.test(client.address)) {
			const value = describe(client.address);
			throw unsafeValueError(`${label}: access list client address ${value} is not allowed`, {
				field: "access_list_client_address",
				value,
			});
		}
	}
};

// Can be written into config without ending or changing a token
export const isTokenSafe = (value) => typeof value === "string" && value.length > 0 && !unsafeToken.test(value);

/**
 * Checks every user-supplied value the host's template renders. Call before rendering.
 *
 * @param   {String}  hostType  proxy_host, redirection_host, dead_host, stream or default
 * @param   {Object}  host      with access_list loaded, for proxy hosts
 * @throws  {ConfigurationError}
 */
export const assertHostRenderable = (hostType, host) => {
	const label = `${hostType.replace(/_/g, " ")} #${host.id}`;
	const check = (ok, what, value) => {
		if (!ok) {
			const shown = describe(value);
			throw unsafeValueError(`${label}: ${what} ${shown} is not allowed in nginx config`, {
				field: unsafeValueField(what),
				value: shown,
			});
		}
	};

	if (hostType !== "stream" && hostType !== "default") {
		for (const name of host.domain_names || []) {
			check(isTokenSafe(name), "domain name", name);
		}
	}

	if (hostType === "proxy_host") {
		check(isTokenSafe(host.forward_host), "forward host", host.forward_host);
		assertAccessListRenderable(label, host.access_list);
		for (const loc of host.locations || []) {
			// The path is several tokens (modifier, then a quoted or unquoted URI): its rule is the
			// structural one
			check(isValid("locationPath", loc.path), "location path", loc.path);
			check(isTokenSafe(loc.forward_host), "location forward host", loc.forward_host);
			if (loc.forward_path) {
				check(isTokenSafe(loc.forward_path), "location forward path", loc.forward_path);
			}
		}
	}

	if (hostType === "redirection_host") {
		check(isTokenSafe(host.forward_domain_name), "forward domain", host.forward_domain_name);
	}

	if (hostType === "stream") {
		check(isTokenSafe(host.forwarding_host), "forwarding host", host.forwarding_host);
	}
};
