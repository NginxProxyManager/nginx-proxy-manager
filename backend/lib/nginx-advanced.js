/**
 * Narrow server-side check of user supplied advanced configuration (host and custom location level).
 *
 * Advanced configuration is trusted nginx configuration: whoever may edit it can do anything nginx and its
 * modules can do (lua, `set $p ...; access_log $p;`, proxy_store, ...). This check is NOT a security
 * boundary. It guards against accidental and obvious damage to other hosts' configs:
 * - `access_log /data/nginx/proxy_host/2.conf;` makes nginx append log lines to another host's config
 *   (breaking it at the next test), and to /data/nginx/custom/*.conf or /etc/nginx/ (every host)
 * - `include /data/nginx/proxy_host/2.conf;` pulls another host's config into this one
 *
 * Rejected:
 * - access_log / error_log targets in a generated config dir (/data/nginx/proxy_host/, ..., /data/nginx/temp/),
 *   any `.conf` file under /data/nginx/ (eg. /data/nginx/custom/http.conf), any `.conf`, `.types` or
 *   `*_params` file under /etc/nginx/, anything under /etc/nginx/conf.d/
 * - include of anything in a generated config dir
 * - for both: paths through /proc/ or /dev/fd/ (`/proc/self/root/data/nginx/...`), and wildcards (glob
 *   characters in include, a $variable in access_log) whose fixed part could still reach one of the above
 * - access_log paths that end with a $variable (no literal `.xyz` tail after it) when the fixed part is in
 *   /data/nginx/ or /etc/nginx/ (or a prefix of either) or ends with `/`: variables are filled in from the
 *   request and nginx doesn't sanitise `..` or `/` in them, so eg. `access_log /data/nginx/custom/$http_x;`
 *   lets any client pick the file. `/data/logs/$host.log` is fine.
 *
 * Allowed, notably: relative log paths (they resolve below the nginx prefix /etc/nginx/nginx/), logs in
 * /data/logs/ or /data/nginx/custom/*.log, `off`, stderr, syslog:, `root`, `alias` and include of the user's
 * own snippets (/data/nginx/custom/*.conf, /snippets/*.conf, conf.d/include/*.conf).
 *
 * Paths are read with the same tokenizer as nginx (lib/nginx-tokenize.js), so quotes or `#` in the middle of
 * a token don't hide a directive. It reads *_by_lua_block bodies as Lua, like ngx_lua does, so Lua code isn't
 * checked as directives and a quote or brace in a Lua comment or string doesn't hide the directives after the
 * block. Lua code can open any file anyway, see above.
 *
 * This module has no database imports so it can be unit tested.
 */

import { posix } from "node:path";
import { scanNginxConfig } from "./nginx-tokenize.js";

// nginx -V: --prefix=/etc/nginx/nginx (relative log paths), --conf-path=/etc/nginx/nginx.conf (relative includes)
const LOG_PREFIX = "/etc/nginx/nginx/";
const CONF_PREFIX = "/etc/nginx/";

// Directories whose files NPM generates and nginx includes
const MANAGED_DIRS = [
	"/data/nginx/proxy_host/",
	"/data/nginx/redirection_host/",
	"/data/nginx/dead_host/",
	"/data/nginx/stream/",
	"/data/nginx/default_host/",
	"/data/nginx/temp/",
];

// glob(3) characters nginx's include expands
const GLOB_CHARS = /[*?[]/;

/**
 * @param   {String} text
 * @returns {String[][]} the tokens of each statement
 */
const tokenize = (text) => scanNginxConfig(text).statements.map((s) => s.tokens);

/**
 * @param   {String} path    as written in the config
 * @param   {String} prefix  what a relative path is relative to
 * @returns {String} the absolute, normalised path (`..`, `.` and `//` resolved)
 */
const resolvePath = (path, prefix) => posix.normalize(path.startsWith("/") ? path : `${prefix}${path}`);

/**
 * @param   {String} resolved
 * @returns {boolean} true for paths through /proc/ or /dev/fd/, which can lead anywhere
 */
const isIndirect = (resolved) =>
	resolved === "/proc" || resolved.includes("/proc/") || resolved === "/dev/fd" || resolved.startsWith("/dev/fd/");

/**
 * @param   {String} resolved
 * @returns {boolean}
 */
const inManagedDir = (resolved) => MANAGED_DIRS.some((dir) => resolved.startsWith(dir) || `${resolved}/` === dir);

const CONFIG_SUFFIX = /(\.conf|\.types|_params)$/;

/**
 * @param   {String} resolved
 * @returns {boolean} true when writing log lines into the file would break configs nginx reads
 */
const isConfigFile = (resolved) => {
	if (inManagedDir(resolved)) {
		return true;
	}
	if (resolved.startsWith("/data/nginx/") && resolved.endsWith(".conf")) {
		return true;
	}
	if (resolved.startsWith(CONF_PREFIX)) {
		return (
			resolved.startsWith(`${CONF_PREFIX}conf.d/`) ||
			resolved === `${CONF_PREFIX}conf.d` ||
			CONFIG_SUFFIX.test(resolved)
		);
	}
	return false;
};

/**
 * @param   {String} segment  one path segment of an include pattern
 * @returns {RegExp} what glob(3) matches with it
 */
const globSegment = (segment) => {
	let re = "";
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i];
		if (ch === "\\" && i + 1 < segment.length) {
			// glob(3) escape, nginx doesn't pass GLOB_NOESCAPE
			re += segment[++i].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
		} else if (ch === "*") {
			re += "[^/]*";
		} else if (ch === "?") {
			re += "[^/]";
		} else if (ch === "[" && segment.indexOf("]", i + 2) !== -1) {
			const close = segment.indexOf("]", i + 2);
			let body = segment.slice(i + 1, close);
			const negate = body.startsWith("!") || body.startsWith("^");
			body = (negate ? body.slice(1) : body).replace(/[\\\]^]/g, "\\$&");
			re += `[${negate ? "^" : ""}${body}]`;
			i = close;
		} else {
			re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
		}
	}
	try {
		return new RegExp(`^${re}$`);
	} catch {
		// eg. an invalid range: assume it matches anything
		return /^[^/]*$/;
	}
};

/**
 * @param   {String} pattern  absolute, normalised include pattern with glob characters
 * @returns {boolean} true when it can match a file in a generated config dir
 */
const globMayReachManaged = (pattern) => {
	const segments = pattern.split("/").slice(1);
	return MANAGED_DIRS.some((dir) => {
		const dirSegments = dir.split("/").slice(1, -1);
		// a file inside the dir needs at least one more segment
		if (segments.length <= dirSegments.length) {
			return false;
		}
		return dirSegments.every((name, i) => globSegment(segments[i]).test(name));
	});
};

/**
 * @param   {String} target  argument of include
 * @returns {boolean}
 */
const isForbiddenInclude = (target) => {
	if (!target) {
		return false;
	}
	const resolved = resolvePath(target, CONF_PREFIX);
	if (isIndirect(resolved) || inManagedDir(resolved)) {
		return true;
	}
	return GLOB_CHARS.test(resolved) && globMayReachManaged(resolved);
};

/**
 * @param   {String} target     first argument of access_log / error_log
 * @param   {String} directive
 * @returns {boolean}
 */
const isForbiddenLogTarget = (target, directive) => {
	if (!target || target === "off" || target === "stderr" || /^(syslog|memory):/.test(target)) {
		return false;
	}
	// access_log opens a path with variables per request (error_log has no variables): only the part
	// before the first variable is known
	const at = directive === "access_log" ? target.indexOf("$") : -1;
	if (at === -1) {
		const resolved = resolvePath(target, LOG_PREFIX);
		return isIndirect(resolved) || isConfigFile(resolved);
	}
	if (at === 0) {
		// `access_log $path;` can't be known, see the top of this file
		return false;
	}
	const fixed = target.slice(0, at);
	const absolute = fixed.startsWith("/") ? fixed : `${LOG_PREFIX}${fixed}`;
	const resolved = posix.normalize(absolute);
	if (isIndirect(resolved) || inManagedDir(resolved)) {
		return true;
	}
	// Variables are filled in from the request and nginx doesn't sanitise `/` or `..` in them: when the path
	// ends with a variable, a client could pick any file name below a directory nginx reads configuration from
	// (or, with the variable starting a path segment, any file at all). A literal tail with a dot after the
	// last variable (`$host.log`) can't complete a config file name, see CONFIG_SUFFIX.
	const tail = target.replace(/^.*\$(\{\w*\}|\w*)/s, "");
	const underConfigDir = ["/data/nginx/", CONF_PREFIX].some(
		(dir) => resolved.startsWith(dir) || `${resolved}/` === dir || dir.startsWith(resolved),
	);
	if ((underConfigDir || fixed.endsWith("/")) && !tail.includes(".")) {
		return true;
	}
	// the variable could complete the fixed part to a generated config dir or conf.d
	const roots = [...MANAGED_DIRS, `${CONF_PREFIX}conf.d/`];
	if (roots.some((root) => root.startsWith(resolved) || resolved.startsWith(root))) {
		return true;
	}
	// or to a config file below /data/nginx/ or /etc/nginx/
	return (
		(resolved.startsWith("/data/nginx/") ||
			resolved.startsWith(CONF_PREFIX) ||
			"/data/nginx/".startsWith(resolved)) &&
		CONFIG_SUFFIX.test(target)
	);
};

/**
 * @param   {String} text  advanced configuration
 * @returns {{directive: String, path: String, reason: String}|null} the first forbidden file directive
 */
const findForbiddenFileDirective = (text) => {
	for (const [directive, target] of tokenize(text)) {
		if ((directive === "access_log" || directive === "error_log") && isForbiddenLogTarget(target, directive)) {
			return {
				directive,
				path: target,
				reason: `${directive} can't write to "${target}": log files must not be placed where nginx reads configuration (generated host configs, *.conf files in /data/nginx/, /etc/nginx/), use /data/logs/ instead`,
			};
		}
		if (directive === "include" && isForbiddenInclude(target)) {
			return {
				directive,
				path: target,
				reason: `include of "${target}" is not allowed: files in /data/nginx/ generated for other hosts can't be included, put shared snippets in /data/nginx/custom/ instead`,
			};
		}
	}
	return null;
};

export { findForbiddenFileDirective, tokenize };
