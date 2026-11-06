/**
 * Rendering of proxy host custom locations.
 *
 * Every location is wrapped in marker comments so an `nginx -t` error line can be mapped back
 * to the location that caused it:
 *
 *   # npm-location-begin <i>
 *   location /path { ... }
 *   # npm-location-end <i>
 *
 * A location is rendered in one of these ways (see docs/src/advanced-config/locations.md):
 * - dynamic:     the upstream host is put in a variable, nginx resolves it per request
 * - static:      the upstream host is literal (the historic behaviour)
 * - quarantined: `location <path> { return 503; }` or nothing at all
 * - disabled:    nothing, the user switched the location off
 *
 * This module has no database imports so it can be unit tested.
 */

import fs from "node:fs";
import net from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanNginxConfig } from "./nginx-tokenize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_FILE = `${__dirname}/../templates/_location.conf`;

const CONFIG_VERSION = 2;
const CONFIG_VERSION_MARKER = `# npm-config-version: ${CONFIG_VERSION}`;

/**
 * The rendering of custom locations depends on settings read at startup (NPM_LOCATION_DYNAMIC_DNS, DISABLE_RESOLVER
 * and the generated resolvers.conf). The config of a proxy host with locations records which one it was written for,
 * so the startup reconcile regenerates it when the setting changed (eg. back to literal upstreams).
 *
 * @param   {Function} modeResolver  from createModeResolver() (lib/upstream-dns.js)
 * @returns {String} eg. `# npm-location-dns: dynamic`
 */
const locationDnsMarker = (modeResolver) =>
	`# npm-location-dns: ${modeResolver?.dynamicEnabled && modeResolver?.hasResolver ? "dynamic" : "static"}`;

// Characters that would break out of the generated nginx directive
const INVALID_HOST_CHARS = /[\s;{}'"`\\$#]/;
// The same for the forward path, which may hold nginx variables (`/api/$1`)
const INVALID_PATH_CHARS = /[\s;{}'"`\\#]/;

// A forward host that is a single nginx variable, eg. `$backend` with `set $backend app;` in the advanced
// config (a common workaround for "host not found in upstream"). It is rendered literally as it always was:
// no DNS check, no rewrite.
const VARIABLE_HOST = /^\$[A-Za-z_][A-Za-z0-9_]*$/;

// A `$` in the forward path makes nginx treat `proxy_pass` as a script: the computed URI is sent as it is (no
// location prefix replaced, no query string added, no implicit "proxy_redirect default"), see hasVariablePath()
const VARIABLE_IN_PATH = /\$/;

// Variables whose value changes when the dynamic rendering rewrites the URI, see chooseLocationMode()
const URI_VARIABLES = /\$(uri|document_uri)(?![A-Za-z0-9_])|\$\{(uri|document_uri)\}/;

const MESSAGES = {
	regexWithForwardPath:
		"A forward path without an nginx variable can't be used with a regular-expression location; use a capture such as /v1/$1, remove the forward path or use a prefix location.",
	namedWithForwardPath:
		"A forward path without an nginx variable can't be used with a named location; use a variable such as $request_uri or remove the forward path.",
	invalidHost:
		"The forward host contains characters that are not allowed (spaces, quotes, ; { } $ # or \\). A single nginx variable such as $backend is allowed.",
	emptyHost: "The forward host is empty.",
	invalidPath:
		"The forward path contains characters that are not allowed (spaces, quotes, ; { } # or \\). nginx variables such as $1 are allowed.",
	emptyPath: "The location path is empty.",
	unbalancedBraces: "The advanced configuration of this location has unbalanced { } braces.",
	unresolved: (host) =>
		`Host "${host}" can't be resolved right now. Requests to this location fail with 502 until it resolves.`,
	rejected: (text) => `Disabled because nginx rejected it: ${text}`,
	omitted: (text) => `Removed because nginx rejected it, even as a placeholder: ${text}`,
};

/**
 * Removes the quotes nginx strips from a quoted location path, `"/my path"` -> `/my path`
 *
 * @param   {String} uri
 * @returns {String}
 */
const unquote = (uri) => {
	const m = `${uri}`.match(/^(["'])(.*)\1$/s);
	return m ? m[2].replace(/\\(["'\\])/g, "$1") : uri;
};

/**
 * @param   {String} path
 * @returns {{modifier: String, uri: String, unquoted: String, isRegex: boolean, isNamed: boolean, isExact: boolean, normalised: String}}
 */
const parseLocationPath = (path) => {
	const trimmed = `${path || ""}`.trim();
	const match = trimmed.match(/^(=|\^~|~\*|~)\s*(.*)$/s);
	const modifier = match ? match[1] : "";
	const uri = (match ? match[2] : trimmed).trim();
	return {
		modifier,
		uri,
		unquoted: unquote(uri),
		isRegex: modifier === "~" || modifier === "~*",
		isNamed: !modifier && uri.startsWith("@"),
		isExact: modifier === "=",
		normalised: modifier ? `${modifier} ${uri}` : uri,
	};
};

/**
 * Normalised form used to detect duplicates, `^~  /x` -> `^~ /x`
 *
 * @param   {String} path
 * @returns {String}
 */
const normaliseLocationPath = (path) => parseLocationPath(path).normalised;

/**
 * The saved location each incoming location replaces, matched by path (as the advanced config check of
 * users who aren't admins does). Paths are compared trimmed, as they are saved; regex and named locations
 * may repeat a path, so the n-th location with a path matches the n-th saved one with that path.
 *
 * @param   {Array} locations  incoming
 * @param   {Array} saved      of the saved host
 * @returns {Array}            for each incoming location the saved one, or undefined
 */
const matchSavedLocations = (locations, saved) => {
	const pathOf = (location) => `${location?.path ?? ""}`.trim();
	const seen = new Map();
	return (locations || []).map((location) => {
		const path = pathOf(location);
		const n = seen.get(path) || 0;
		seen.set(path, n + 1);
		return (Array.isArray(saved) ? saved : []).filter((s) => pathOf(s) === path)[n];
	});
};

/**
 * Only the duplicates nginx itself rejects with `duplicate location`: two exact locations with the same
 * URI, or two prefix locations with the same URI (`/x` and `^~ /x` count as the same). nginx accepts
 * duplicate regex and named locations (the first one wins), so they are left alone.
 *
 * @param   {Array} locations
 * @returns {String|null}  the first duplicated (normalised) path, or null
 */
const findDuplicatePath = (locations) => {
	const seen = new Set();
	for (const location of locations || []) {
		const parsed = parseLocationPath(location?.path);
		if (!parsed.uri || parsed.isRegex || parsed.isNamed) {
			continue;
		}
		const key = `${parsed.isExact ? "=" : "prefix"} ${parsed.unquoted}`;
		if (seen.has(key)) {
			return parsed.normalised;
		}
		seen.add(key);
	}
	return null;
};

/**
 * @param   {String} str
 * @returns {String}
 */
const escapeRegex = (str) => `${str}`.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Trims the user input and splits `host/path` the way it has always been done:
 * a path in the forward host wins over the forward path field.
 *
 * @param   {Object} location
 * @returns {Object} a copy
 */
const prepareLocation = (location) => {
	const loc = Object.assign({}, location);
	loc.path = `${loc.path || ""}`.trim();
	loc.forward_host = `${loc.forward_host || ""}`.trim();
	loc.forward_path = typeof loc.forward_path === "string" ? loc.forward_path.trim() : "";

	if (loc.forward_host.indexOf("/") > -1) {
		const splitted = loc.forward_host.split("/");
		loc.forward_host = splitted.shift();
		loc.forward_path = `/${splitted.join("/")}`;
	}

	if (loc.forward_path && !loc.forward_path.startsWith("/")) {
		loc.forward_path = `/${loc.forward_path}`;
	}

	if (net.isIPv6(loc.forward_host)) {
		loc.forward_host = `[${loc.forward_host}]`;
	}

	return loc;
};

/**
 * Checks that { and } are balanced the way nginx's tokenizer sees them: a comment (#) or a quoted string
 * only starts at the beginning of a token, so `/#/x` or `don't` are plain words. Inside a word `{`
 * opens a block (unless it is `${var}`) and `}` is part of the word.
 *
 * @param   {String} text
 * @returns {boolean}
 */
const bracesBalanced = (text) => {
	const scan = scanNginxConfig(text);
	return scan.balanced && !scan.unterminated;
};

/**
 * @param   {String} host
 * @returns {boolean} true when the forward host is a single nginx variable, eg. `$backend`
 */
const isVariableHost = (host) => VARIABLE_HOST.test(`${host || ""}`.trim());

/**
 * nginx compiles a `proxy_pass` that contains a variable anywhere as a script and resolves its host per request:
 * `proxy_pass http://app:80/api/$arg_id;` sends exactly `/api/<id>` (no remaining path, no query string), and
 * `$1` refers to the location's own regex captures. A rewrite in front of it would change that, so such a
 * location is always rendered literally, see chooseLocationMode().
 *
 * @param   {Object} loc  a prepared location
 * @returns {boolean} true when the forward path contains an nginx variable, eg. `/api/$arg_id`
 */
const hasVariablePath = (loc) => VARIABLE_IN_PATH.test(`${loc.forward_path || ""}`);

/**
 * Problems that are known before nginx is asked.
 *
 * @param   {Object} loc  a prepared location
 * @returns {{status: String, message: String|null}|null}
 */
const preflightLocation = (loc) => {
	if (loc.enabled === false) {
		return { status: "disabled", message: null };
	}
	const parsed = parseLocationPath(loc.path);
	if (!parsed.uri) {
		return { status: "quarantined", message: MESSAGES.emptyPath };
	}
	if (!loc.forward_host) {
		return { status: "quarantined", message: MESSAGES.emptyHost };
	}
	if (!isVariableHost(loc.forward_host) && INVALID_HOST_CHARS.test(loc.forward_host)) {
		return { status: "quarantined", message: MESSAGES.invalidHost };
	}
	// `${name}` is a variable too
	if (loc.forward_path && INVALID_PATH_CHARS.test(loc.forward_path.replace(/\$\{[A-Za-z0-9_]+\}/g, "$x"))) {
		return { status: "quarantined", message: MESSAGES.invalidPath };
	}
	if (!bracesBalanced(loc.advanced_config)) {
		return { status: "quarantined", message: MESSAGES.unbalancedBraces };
	}
	// nginx -t rejects a URI in the proxy_pass of a regex or named location ("cannot have URI part"), but not
	// when the proxy_pass has a variable: `location ~ ^/api/(.*)$` with forward path `/v1/$1`, or forward host
	// `$backend` with forward path `/v1/`, have always worked. Such a location is rendered literally, see
	// chooseLocationMode().
	const variableProxyPass = hasVariablePath(loc) || isVariableHost(loc.forward_host);
	if (loc.forward_path && !variableProxyPass && parsed.isRegex) {
		return { status: "quarantined", message: MESSAGES.regexWithForwardPath };
	}
	if (loc.forward_path && !variableProxyPass && parsed.isNamed) {
		return { status: "quarantined", message: MESSAGES.namedWithForwardPath };
	}
	return null;
};

/**
 * @param   {String} advancedConfig
 * @param   {String} directive
 * @returns {boolean}
 */
const hasDirective = (advancedConfig, directive) =>
	new RegExp(`(^|[;{}\\s])${directive}\\s`, "m").test(`${advancedConfig || ""}`.replace(/#.*$/gm, ""));

/**
 * @param   {Object} loc  a prepared location
 * @returns {boolean} true when the dynamic rendering of this location rewrites the URI
 */
const rewritesUri = (loc) => {
	const parsed = parseLocationPath(loc.path);
	return !!loc.forward_path && !parsed.isRegex && !parsed.isNamed && !hasVariablePath(loc);
};

/**
 * The final mode of a location, from what the DNS check (lib/upstream-dns.js) found:
 *
 * - a forward host that is an nginx variable is always static (rendered literally, as it always was)
 * - so is a forward path with an nginx variable (`/api/$arg_id`): nginx sends that URI as it is and already
 *   resolves the host per request, because the proxy_pass has a variable (an unknown host doesn't fail
 *   `nginx -t`). The rewrite of the dynamic rendering would append the rest of the path and the query string.
 *   A host that doesn't resolve keeps the status "unresolved" (502 until it resolves).
 * - with a forward path the dynamic rendering replaces the location prefix through `rewrite ... break`,
 *   which changes $uri and $document_uri for everything that runs later (proxy_set_header, add_header,
 *   try_files, ...). A location whose advanced config reads one of them stays static while its host
 *   resolves, so it sees the same value as before. When the host does not resolve it has to be dynamic
 *   (a literal unknown host fails `nginx -t` for every host), see docs/src/advanced-config/locations.md.
 *
 * @param   {Object} loc       a prepared location
 * @param   {Object} resolved  {mode, status} from the mode resolver
 * @returns {{mode: String, status: String}}
 */
const chooseLocationMode = (loc, resolved) => {
	if (isVariableHost(loc.forward_host)) {
		return { mode: "static", status: "ok" };
	}
	if (hasVariablePath(loc)) {
		return { mode: "static", status: resolved.status === "unresolved" ? "unresolved" : "ok" };
	}
	if (
		resolved.mode === "dynamic" &&
		resolved.status === "ok" &&
		rewritesUri(loc) &&
		URI_VARIABLES.test(`${loc.advanced_config || ""}`)
	) {
		return { mode: "static", status: "ok" };
	}
	return { mode: resolved.mode, status: resolved.status };
};

/**
 * @param   {String} value  a token's value as nginx sees it (unescaped)
 * @returns {String} the value as a double quoted nginx string that reads back as the same value
 */
const quoteNginxValue = (value) => `"${`${value}`.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The `set` statements at the top level of a location's advanced config, in order, for the nested asset location:
 * a nested location doesn't run the rewrite-phase directives of its parent, so a variable used by the forward
 * host / path (`set $target t;` with forward path `/v1/$target`) or by an inherited proxy_set_header would be
 * empty there.
 *
 * Only top-level `set $name value;` statements are repeated. Not covered: a `set` inside an `if` (or another
 * block), variables changed by other directives (`rewrite`, `auth_request_set`, a regex `if` and its captures,
 * ...) and a `set` that reads such a variable. For those the nested asset location only sees the value from the
 * repeated top-level `set` statements (or none).
 *
 * @param   {String} advancedConfig
 * @returns {String[]} eg. ['set $target "t";']
 */
const assetSetDirectives = (advancedConfig) =>
	scanNginxConfig(advancedConfig)
		.statements.filter(
			(s) =>
				s.depth === 0 &&
				s.end === ";" &&
				s.tokens.length === 3 &&
				s.tokens[0] === "set" &&
				/^\$[A-Za-z0-9_]+$/.test(s.tokens[1]),
		)
		.map((s) => `set ${s.tokens[1]} ${quoteNginxValue(s.tokens[2])};`);

/**
 * Template variables (all prefixed npm_) for the dynamic / static rendering of a location.
 *
 * @param   {Object} loc    prepared location (merged with the host's settings)
 * @param   {Object} state  {index, mode}
 * @returns {Object}
 */
const buildLocationContext = (loc, state) => {
	const parsed = parseLocationPath(loc.path);
	const dynamic = state.mode === "dynamic";
	const hostVar = `$npm_loc_${state.index}_host`;
	const upstreamBase = `${loc.forward_scheme}://${loc.forward_host}:${loc.forward_port}`;
	const fp = loc.forward_path || "";
	const canRewrite = rewritesUri(loc);
	// (?s): "." also matches a newline (%0A in the URI), otherwise such a URI is not rewritten and reaches
	// the upstream outside of the forward path. Quoted, so a quoted path with spaces stays one argument.
	const rewrite = canRewrite ? `"(?s)^${escapeRegex(parsed.unquoted).replace(/"/g, '\\"')}(.*)$" ${fp}$1` : "";
	const redirect = canRewrite ? `${upstreamBase}${fp} ${parsed.uri}` : `${upstreamBase}/ /`;
	// nginx does not allow nested locations in exact match and named locations. Every other location with
	// "Cache Assets" gets the nested asset location, also one with a variable forward host ($backend) or forward
	// path (/api/$arg_id): without it the host-level asset regex (conf.d/include/assets.conf, included in the
	// server block before the custom locations) wins over the prefix location and sends its assets to the host's
	// main upstream. A nested location doesn't run the parent's `set`, so the top-level `set` statements of the
	// advanced config are repeated in it, see assetSetDirectives(). A variable proxy_pass is repeated as it is
	// (nginx sends its URI as it is, no rewrite), like the parent it has no implicit "proxy_redirect default".
	const userRedirect = hasDirective(loc.advanced_config, "proxy_redirect");
	const variableProxyPass = isVariableHost(loc.forward_host) || hasVariablePath(loc);
	const assetsAllowed = !parsed.isExact && !parsed.isNamed;

	return Object.assign({}, loc, {
		forward_path: fp,
		npm_index: state.index,
		npm_mode: state.mode,
		npm_dynamic: dynamic,
		npm_host_var: hostVar,
		npm_upstream: dynamic ? hostVar : loc.forward_host,
		npm_rewrite: rewrite,
		// A variable proxy_pass disables "proxy_redirect default", so it is spelled out unless
		// the user manages proxy_redirect in the advanced config
		npm_redirect: dynamic && !userRedirect ? redirect : "",
		npm_assets: assetsAllowed && (loc.caching_enabled === 1 || loc.caching_enabled === true),
		npm_asset_sets: assetSetDirectives(loc.advanced_config),
		npm_asset_rewrite: variableProxyPass ? "" : rewrite,
		npm_asset_uri: variableProxyPass ? fp : "",
		// When the user manages proxy_redirect in the advanced config, the nested location sets none and
		// inherits that rule (a proxy_redirect in the nested block would replace it).
		npm_asset_redirect: userRedirect ? "" : variableProxyPass ? "off" : redirect,
	});
};

const indexMarker = (kind, index) => `# npm-location-${kind} ${index}`;

/**
 * @param   {Object} engine    liquid engine from utils.getRenderEngine()
 * @param   {String} template  contents of _location.conf
 * @param   {Object} loc       prepared location merged with host settings
 * @param   {Object} state     {index, status, mode, stub}
 * @returns {Promise<String>}
 */
const renderLocation = async (engine, template, loc, state) => {
	const begin = indexMarker("begin", state.index);
	const end = indexMarker("end", state.index);

	if (state.status === "disabled") {
		return `  # npm-location ${state.index} disabled by user\n`;
	}

	if (state.status === "quarantined") {
		if (state.stub && loc.path) {
			return `  ${begin}\n  location ${loc.path} {\n    # npm: quarantined, see the host's status in the UI\n    return 503;\n  }\n  ${end}\n`;
		}
		return `  # npm-location ${state.index} quarantined, not rendered\n`;
	}

	const rendered = await engine.parseAndRender(template, buildLocationContext(loc, state));
	return `  ${begin}\n${rendered.replace(/\s+$/, "")}\n  ${end}\n`;
};

/**
 * Finds the custom locations behind an `nginx -t` error that names no line, eg. `unknown "x" variable`
 * (nginx checks variables after parsing the files and doesn't say where they are used). The candidates are
 * replaced by `return 503;` stubs, which contain nothing of the user's input:
 *
 * - still the same error with all of them stubbed: not caused by a location, null
 * - otherwise each candidate is rendered alone, with all the others still stubbed: every one that brings the
 *   same error back fails on its own and is returned (two broken locations with the same message are both
 *   found, a working one is never blamed for them)
 * - none fails alone (eg. two locations only fail together): each candidate is stubbed alone, the first one
 *   that makes the error go away (or change) is returned
 * - none of that: all candidates
 *
 * @param   {Object}   opts
 * @param   {Number[]} opts.candidates     indexes of the locations that are rendered (ok / unresolved)
 * @param   {Object}   opts.parsed         the parsed error
 * @param   {Function} opts.testWithStubs  async (indexes) => {ok, parsed}: nginx -t with those locations stubbed
 * @returns {Promise<Number[]|null>} the indexes to quarantine
 */
const isolateFaultyLocations = async ({ candidates, parsed, testWithStubs }) => {
	const sameError = (result) => !result.ok && result.parsed?.message === parsed.message;
	if (!candidates.length || sameError(await testWithStubs(candidates))) {
		return null;
	}
	if (candidates.length === 1) {
		return candidates;
	}
	const failAlone = [];
	for (const index of candidates) {
		if (sameError(await testWithStubs(candidates.filter((i) => i !== index)))) {
			failAlone.push(index);
		}
	}
	if (failAlone.length) {
		return failAlone;
	}
	for (const index of candidates) {
		if (!sameError(await testWithStubs([index]))) {
			return [index];
		}
	}
	return candidates;
};

/**
 * @returns {String}
 */
const readLocationTemplate = () => fs.readFileSync(TEMPLATE_FILE, { encoding: "utf8" });

/**
 * Maps a line of a generated config to the location / advanced config area it belongs to.
 *
 * @param   {String} configText
 * @param   {Number} line  1-based
 * @returns {{location_index: Number|null, area: "location"|"location_advanced"|"host_advanced"|null, relative_line: Number|null}}
 */
const describeConfigLine = (configText, line) => {
	const result = { location_index: null, area: null, relative_line: null };
	if (!configText || !line) {
		return result;
	}
	const lines = configText.split("\n").slice(0, line);
	let locationIndex = null;
	let locationAdvancedStart = null;
	let hostAdvancedStart = null;

	for (let i = 0; i < lines.length; i++) {
		const text = lines[i].trim();
		let m = text.match(/^# npm-location-begin (\d+)$/);
		if (m) {
			locationIndex = Number.parseInt(m[1], 10);
			continue;
		}
		m = text.match(/^# npm-location-end (\d+)$/);
		if (m) {
			// The error line itself can be the end marker line, that still belongs to the location
			if (i < lines.length - 1) {
				locationIndex = null;
			}
			continue;
		}
		if (/^# npm-location-advanced-begin \d+$/.test(text)) {
			locationAdvancedStart = i + 1;
			continue;
		}
		if (/^# npm-location-advanced-end \d+$/.test(text)) {
			if (i < lines.length - 1) {
				locationAdvancedStart = null;
			}
			continue;
		}
		if (text === "# npm-advanced-config-begin") {
			hostAdvancedStart = i + 1;
			continue;
		}
		if (text === "# npm-advanced-config-end") {
			if (i < lines.length - 1) {
				hostAdvancedStart = null;
			}
		}
	}

	if (locationIndex !== null) {
		result.location_index = locationIndex;
		result.area = "location";
		if (locationAdvancedStart !== null) {
			result.area = "location_advanced";
			result.relative_line = line - locationAdvancedStart;
		}
	} else if (hostAdvancedStart !== null) {
		result.area = "host_advanced";
		result.relative_line = line - hostAdvancedStart;
	}
	return result;
};

/**
 * @param   {Object} state
 * @returns {Object} the public shape stored in meta.nginx_locations
 */
const publicLocationState = (state) => ({
	index: state.index,
	path: state.path,
	status: state.status,
	mode: state.status === "ok" || state.status === "unresolved" ? state.mode : null,
	message: state.message || null,
});

export {
	CONFIG_VERSION,
	CONFIG_VERSION_MARKER,
	MESSAGES,
	assetSetDirectives,
	bracesBalanced,
	buildLocationContext,
	chooseLocationMode,
	describeConfigLine,
	escapeRegex,
	findDuplicatePath,
	hasDirective,
	hasVariablePath,
	isolateFaultyLocations,
	isVariableHost,
	locationDnsMarker,
	matchSavedLocations,
	normaliseLocationPath,
	parseLocationPath,
	preflightLocation,
	prepareLocation,
	publicLocationState,
	readLocationTemplate,
	renderLocation,
};
