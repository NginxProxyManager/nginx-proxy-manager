/**
 * Narrow server-side check of user supplied advanced configuration (host and custom location level).
 *
 * Advanced configuration is trusted nginx configuration: whoever may edit it can do anything nginx and its
 * modules can do (lua, proxy_store, ...). This check is NOT a security boundary. It guards against accidental and obvious damage to other hosts' configs:
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
 * - access_log paths with a variable from the request ($http_*, $arg_*, $cookie_*, $uri, ...: anything but the
 *   few of REQUEST_SAFE_VARIABLES, which can't hold `/` or `..`) whose literal tail could complete a config
 *   file name (no `.` after the last variable, a `/` after it, or a .conf/.types/_params ending), whatever
 *   the fixed part: `/data/logs$http_x` reaches `/data/nginx/proxy_host/2.conf` with `X: /../nginx/proxy_host/2.conf`.
 * - access_log paths that start with such a variable (`$http_x`, `"$arg_f"`, `$cookie_c.log`): the client
 *   picks the whole path, eg. `X: ../../../data/nginx/proxy_host/2.conf` (relative to /etc/nginx/nginx/).
 *   Variables set in the same text (`set $p ...; access_log $p;`) are replaced by each value they are set to
 *   first, so a path set from literals and REQUEST_SAFE_VARIABLES is checked like a literal path; any other
 *   variable (set elsewhere, map, regex captures such as $1, nginx variables not listed) counts as one the
 *   client controls.
 * - access_log paths that climb out of a variable with `..` after it (`/data/$host/../nginx/proxy_host/2.conf`)
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

// .npm-aside: a config set aside during a test, which NPM puts back as the .conf at startup when that is missing
const CONFIG_SUFFIX = /(\.conf|\.types|_params|\.npm-aside)$/;

// Variables whose values can't hold `/` or `..` (nginx rejects them in Host, the others are numbers, addresses
// or fixed words): an access_log path built from them can't be steered into another directory
const REQUEST_SAFE_VARIABLES = new Set([
	"host",
	"server_name",
	"server_port",
	"server_addr",
	"remote_addr",
	"remote_port",
	"scheme",
	"status",
	"request_method",
	"msec",
	"pid",
	"connection",
]);

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
 * Reads one path segment of an include pattern the way glob(3) does. Hand-written instead of a RegExp built
 * from the pattern: runs of `*` (or `*?*?...`) made the RegExp backtrack exponentially, and this check runs on
 * the request path.
 *
 * @param   {String} segment  one path segment of an include pattern
 * @returns {Array<Object>|null} its parts: {star}, {any} (`?`), {char} or {ranges, negate} (`[...]`), null when
 *                               nginx's glob would reject it (eg. an invalid range): assume it matches anything
 */
const parseGlobSegment = (segment) => {
	const parts = [];
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i];
		if (ch === "\\" && i + 1 < segment.length) {
			// glob(3) escape, nginx doesn't pass GLOB_NOESCAPE
			parts.push({ char: segment[++i] });
		} else if (ch === "*") {
			// a run of stars matches the same as one
			if (!parts.at(-1)?.star) {
				parts.push({ star: true });
			}
		} else if (ch === "?") {
			parts.push({ any: true });
		} else if (ch === "[" && segment.indexOf("]", i + 2) !== -1) {
			const close = segment.indexOf("]", i + 2);
			let body = segment.slice(i + 1, close);
			const negate = body.startsWith("!") || body.startsWith("^");
			body = negate ? body.slice(1) : body;
			const ranges = [];
			for (let j = 0; j < body.length; j++) {
				if (body[j + 1] === "-" && j + 2 < body.length) {
					const from = body.charCodeAt(j);
					const to = body.charCodeAt(j + 2);
					if (from > to) {
						return null;
					}
					ranges.push([from, to]);
					j += 2;
				} else {
					ranges.push([body.charCodeAt(j), body.charCodeAt(j)]);
				}
			}
			parts.push({ ranges, negate });
			i = close;
		} else {
			parts.push({ char: ch });
		}
	}
	return parts;
};

/**
 * @param   {Object} part  one part of parseGlobSegment() other than a star
 * @param   {String} ch
 * @returns {boolean}
 */
const globPartMatches = (part, ch) => {
	if (part.any) {
		return true;
	}
	if (part.ranges) {
		const code = ch.charCodeAt(0);
		return part.ranges.some(([from, to]) => code >= from && code <= to) !== part.negate;
	}
	return part.char === ch;
};

/**
 * Wildcard match that goes back only to the last star: at most name length x pattern length steps.
 *
 * @param   {String} segment  one path segment of an include pattern
 * @param   {String} name     a directory name (no `/`)
 * @returns {boolean} true when glob(3) matches the name with the segment
 */
const globSegmentMatches = (segment, name) => {
	const parts = parseGlobSegment(segment);
	if (parts === null) {
		return true;
	}
	let p = 0;
	let n = 0;
	let starAt = -1;
	let starName = 0;
	while (n < name.length) {
		if (p < parts.length && parts[p].star) {
			starAt = p++;
			starName = n;
		} else if (p < parts.length && globPartMatches(parts[p], name[n])) {
			p++;
			n++;
		} else if (starAt !== -1) {
			// let the last star take one more character
			p = starAt + 1;
			n = ++starName;
		} else {
			return false;
		}
	}
	while (p < parts.length && parts[p].star) {
		p++;
	}
	return p === parts.length;
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
		return dirSegments.every((name, i) => globSegmentMatches(segments[i], name));
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
	const variables = [...target.matchAll(/\$(?:\{(\w*)\}|(\w*))/g)].map((m) => m[1] ?? m[2]);
	if (at === 0 && !REQUEST_SAFE_VARIABLES.has(variables[0])) {
		// the client picks the whole path
		return true;
	}
	// `..` after a variable can leave whatever directory the variable named
	if (/(^|\/)\.\.(\/|$)/.test(target.slice(at))) {
		return true;
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
	// A variable a client fills in (eg. $http_x = "/../nginx/proxy_host/2") can leave any fixed part that is (or
	// completes to) an existing directory: unless the tail rules out a config file name, only variables that
	// can't hold `/` or `..` are fine. A tail with a `/` (`$http_x.d/foo`) leaves the client the directory of a
	// file name without an extension.
	if (
		(!tail.includes(".") || tail.includes("/") || CONFIG_SUFFIX.test(target)) &&
		variables.some((name) => !REQUEST_SAFE_VARIABLES.has(name))
	) {
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

// at most this many paths are checked for one access_log after replacing variables set in the text
const MAX_EXPANSIONS = 64;
// and at most this many characters of expanded paths for all access_log statements of one text together:
// repeated statements with long `set` values would otherwise cost (statements x paths x path length), a text
// that needs more is treated as forbidden
const MAX_EXPANDED_CHARS = 2_000_000;

/**
 * @param   {String} target  access_log path
 * @param   {Map<String, String[]>} sets  values of the variables `set` in the same text
 * @param   {{left: number}} budget  characters of expanded paths left for the whole text, reduced here
 * @returns {String[]|null} the path with every variable set in the text replaced by each of its values
 *                          (variables set to themselves, eg. `set $p $p.x`, stay), null when there are too many
 *                          or the budget is used up
 */
const expandSetVariables = (target, sets, budget) => {
	budget.left -= target.length;
	if (budget.left < 0) {
		return null;
	}
	let paths = [target];
	for (let round = 0; round < 8; round++) {
		let changed = false;
		const next = [];
		for (const path of paths) {
			const m = /\$(?:\{(\w*)\}|(\w*))/g;
			let match = m.exec(path);
			while (match && !sets.has(match[1] ?? match[2])) {
				match = m.exec(path);
			}
			if (!match) {
				next.push(path);
				continue;
			}
			changed = true;
			const before = path.slice(0, match.index);
			const after = path.slice(match.index + match[0].length);
			for (const value of sets.get(match[1] ?? match[2])) {
				budget.left -= before.length + value.length + after.length;
				if (budget.left < 0 || next.length >= MAX_EXPANSIONS) {
					return null;
				}
				next.push(before + value + after);
			}
		}
		paths = next;
		if (!changed) {
			return paths;
		}
	}
	// still variables set from other set variables after 8 rounds (eg. `set $p $p.x`): check them as they are
	return paths;
};

/**
 * @param   {String} text  advanced configuration
 * @returns {{directive: String, path: String, reason: String}|null} the first forbidden file directive
 */
const findForbiddenFileDirective = (text) => {
	const statements = tokenize(text);
	const sets = new Map();
	const selfSet = new Set();
	for (const [directive, name, value] of statements) {
		if (directive === "set" && typeof name === "string" && /^\$\w+$/.test(name) && typeof value === "string") {
			const key = name.slice(1);
			// a variable set from itself would be replaced forever: keep it, it counts as one a client controls
			if ([...value.matchAll(/\$(?:\{(\w*)\}|(\w*))/g)].some((m) => (m[1] ?? m[2]) === key)) {
				selfSet.add(key);
			}
			if (!sets.has(key)) {
				sets.set(key, []);
			}
			sets.get(key).push(value);
		}
	}
	for (const key of selfSet) {
		sets.delete(key);
	}
	const budget = { left: MAX_EXPANDED_CHARS };
	for (const [directive, target] of statements) {
		const targets = directive === "access_log" && target ? expandSetVariables(target, sets, budget) : [target];
		if (
			(directive === "access_log" || directive === "error_log") &&
			(targets === null || targets.some((t) => isForbiddenLogTarget(t, directive)))
		) {
			return {
				directive,
				path: target,
				reason: `${directive} can't write to "${target}": log files must not be placed where nginx reads configuration (generated host configs, *.conf files in /data/nginx/, /etc/nginx/), and a log path with a variable from the request (eg. $http_*, $arg_*, $cookie_*) must start with a fixed directory and end with a file name extension such as .log, use /data/logs/ instead`,
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
