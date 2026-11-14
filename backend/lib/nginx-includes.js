/**
 * Reads the files that the `include` statements of a location's advanced config bring into the location, the way
 * nginx does (ngx_conf_include() in src/core/ngx_conf_file.c):
 *
 * - a relative path is relative to the config prefix, the directory of nginx.conf (/etc/nginx/ in the image), also in
 *   a nested include, not to the including file
 * - a path with `*`, `?` or `[` is a glob (glob(3) without flags: a wildcard doesn't match a leading `.`, `\` escapes
 *   the next character, no match is no error and includes nothing); any other path must be readable
 * - an included file is parsed in the context of the include, so its top-level statements are statements of the
 *   location, and an `include` among them is read as well
 *
 * The backend runs in the container that runs nginx, so it sees the same files. What it can't read (a missing file,
 * no permission, a directory it can't list, an include cycle or nesting deeper than MAX_DEPTH) is reported as
 * `unreadable`; the caller then has to assume the worst, see chooseLocationMode() in lib/nginx-locations.js.
 *
 * The rendering is synchronous, so a read must never block or run away (readRegularFile()): only regular files of
 * at most MAX_FILE_SIZE bytes are read. A character or block device (/dev/null, /dev/zero, /dev/urandom) is never
 * opened and counts as empty, as for nginx, which reads st_size bytes and that is 0 for a device. A FIFO (nginx
 * blocks on it until a writer comes), a socket (nginx can't open it) or a bigger file is unreadable.
 *
 * The file access is injectable for the unit tests. One reader caches what it read, create one per render.
 */

import fs from "node:fs";
import { scanNginxConfig } from "./nginx-tokenize.js";

const NGINX_CONF_PREFIX = "/etc/nginx/";
const MAX_DEPTH = 16;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const GLOB_CHARS = /[*?[]/;
const INCLUDE_WORD = /include/;

// Variables whose value changes when the dynamic rendering of a location rewrites the URI, see
// chooseLocationMode() in lib/nginx-locations.js
const URI_VARIABLES = /\$(uri|document_uri)(?![A-Za-z0-9_])|\$\{(uri|document_uri)\}/;

const escapeRegexChar = (ch) => (/[.*+?^${}()|[\]\\/-]/.test(ch) ? `\\${ch}` : ch);

/**
 * @param   {String} pattern  one path segment of a glob
 * @param   {Number} i        offset of a `[`
 * @returns {{source: String, next: Number}|null} the regex class and the offset after the `]`, null when it doesn't
 *          close (the `[` is an ordinary character then)
 */
const bracketClass = (pattern, i) => {
	let j = i + 1;
	let negate = false;
	if (pattern[j] === "!" || pattern[j] === "^") {
		negate = true;
		j++;
	}
	let body = "";
	let first = true;
	while (j < pattern.length && (first || pattern[j] !== "]")) {
		let ch = pattern[j];
		if (ch === "\\" && j + 1 < pattern.length) {
			j++;
			ch = pattern[j];
		}
		// a range a-z, the `-` is literal at the start or the end
		if (pattern[j + 1] === "-" && pattern[j + 2] !== undefined && pattern[j + 2] !== "]") {
			const to = pattern[j + 2];
			body += `${escapeRegexChar(ch)}-${escapeRegexChar(to)}`;
			j += 3;
		} else {
			body += escapeRegexChar(ch);
			j++;
		}
		first = false;
	}
	if (j >= pattern.length) {
		return null;
	}
	return { source: `[${negate ? "^" : ""}${body}]`, next: j + 1 };
};

/**
 * @param   {String} segment  one path segment of a glob, eg. `*.conf`
 * @returns {(name: String) => boolean}
 */
const segmentMatcher = (segment) => {
	let source = "";
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i];
		if (ch === "\\" && i + 1 < segment.length) {
			source += escapeRegexChar(segment[++i]);
		} else if (ch === "*") {
			source += ".*";
		} else if (ch === "?") {
			source += ".";
		} else if (ch === "[") {
			const cls = bracketClass(segment, i);
			if (cls) {
				source += cls.source;
				i = cls.next - 1;
			} else {
				source += "\\[";
			}
		} else {
			source += escapeRegexChar(ch);
		}
	}
	const re = new RegExp(`^${source}$`, "s");
	// a leading `.` is only matched by a `.` written in the pattern
	const explicitDot = segment[0] === "." || (segment[0] === "\\" && segment[1] === ".");
	return (name) => (name[0] !== "." || explicitDot) && re.test(name);
};

const unescapeSegment = (segment) => segment.replace(/\\(.)/g, "$1");

const isMissing = (err) => err && (err.code === "ENOENT" || err.code === "ENOTDIR");

/**
 * @param   {String}   pattern  an absolute path with glob characters
 * @param   {Function} readdir  (dir) => names
 * @returns {String[]} the matching paths, sorted as glob(3) sorts them
 * @throws  when a directory exists but can't be listed
 */
const expandGlob = (pattern, readdir) => {
	const segments = pattern.split("/").filter((s, i) => s !== "" || i === 0);
	let paths = [segments[0] === "" ? "" : segments[0]];
	let magicSeen = false;
	const list = (dir) => {
		try {
			return readdir(dir === "" ? "/" : dir);
		} catch (err) {
			if (isMissing(err)) {
				return [];
			}
			throw err;
		}
	};
	for (const segment of segments.slice(1)) {
		const next = [];
		if (GLOB_CHARS.test(segment)) {
			magicSeen = true;
			const matches = segmentMatcher(segment);
			for (const dir of paths) {
				for (const name of list(dir)) {
					if (matches(name)) {
						next.push(`${dir}/${name}`);
					}
				}
			}
		} else {
			const name = unescapeSegment(segment);
			for (const dir of paths) {
				// after a wildcard only what exists is a match
				if (!magicSeen || list(dir).includes(name)) {
					next.push(`${dir}/${name}`);
				}
			}
		}
		paths = next;
	}
	return paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const notRegular = (file, why) => {
	const err = new Error(`${file}: ${why}`);
	err.code = "ENOTREGULAR";
	return err;
};

/**
 * The default readFile: reads a regular file of at most maxSize bytes, up to the size it had when opened, and
 * returns "" for a device without opening it. Anything else throws without blocking: it stats the path before
 * opening it, opens it non-blocking (a FIFO swapped in meanwhile doesn't wait for a writer) and checks the opened
 * file again.
 *
 * @param   {String} file
 * @param   {Number} [maxSize]
 * @returns {String}
 */
const readRegularFile = (file, maxSize = MAX_FILE_SIZE) => {
	const check = (st) => {
		if (st.isCharacterDevice() || st.isBlockDevice()) {
			return 0;
		}
		if (!st.isFile()) {
			throw notRegular(file, "not a regular file");
		}
		if (st.size > maxSize) {
			throw notRegular(file, `larger than ${maxSize} bytes`);
		}
		return st.size;
	};
	const st = fs.statSync(file);
	if (check(st) === 0 && !st.isFile()) {
		return "";
	}
	const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
	try {
		const size = check(fs.fstatSync(fd));
		const buf = Buffer.alloc(size);
		let got = 0;
		while (got < size) {
			const n = fs.readSync(fd, buf, got, size - got, got);
			if (n === 0) {
				break;
			}
			got += n;
		}
		return buf.toString("utf8", 0, got);
	} finally {
		fs.closeSync(fd);
	}
};

/**
 * @param   {Object}   [io]
 * @param   {Function} [io.readFile]  (path) => String, throws when it can't be read
 * @param   {Function} [io.readdir]   (dir) => String[] of names, throws when it can't be listed
 * @param   {String}   [io.prefix]    the nginx config prefix relative includes are resolved against
 * @returns {{scan: (advancedConfig: String) => {directives: Set<String>, unreadable: boolean, files: String[],
 *          usesUriVariable: boolean}}} directives: the names of the top-level statements of every included file
 *          (nested includes too); files: the files read; usesUriVariable: a statement of an included file (at any
 *          depth) reads $uri or $document_uri
 */
// statements of the rewrite phase (ngx_http_rewrite_module, set-misc's set_*, set_by_lua*): a nested location doesn't
// run its parent's, see rewritePhase()
const REWRITE_PHASE = /^(?:set|if|rewrite|return|break|set_[a-z0-9_]+)$/;

/**
 * @param   {String} token  a token's value
 * @returns {String} the token as nginx reads it back to that value: as it is, or in double quotes
 */
const quoteToken = (token) =>
	token !== "" && !/[\s;{}"'\\]/.test(token) && !token.startsWith("#")
		? token
		: `"${token.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;

/**
 * @param   {String} text        the file's text
 * @param   {Object} statement   a statement of scanNginxConfig(text)
 * @param   {Object[]} statements  all of them
 * @returns {String} the statement on one line (an if block with the statements in it), comments left out; a Lua
 *          block as it is written
 */
const compactStatement = (text, statement, statements) => {
	const words = (st) => [st.tokens[0], ...st.tokens.slice(1).map(quoteToken)].join(" ");
	if (statement.lua) {
		return text.slice(statement.start, statement.close);
	}
	if (statement.end !== "{") {
		return `${words(statement)};`;
	}
	const inner = statements
		.filter((st) => st.start > statement.start && st.start < statement.close && st.depth === statement.depth + 1)
		.map((st) => compactStatement(text, st, statements));
	return `${words(statement)} { ${inner.join(" ")} }`;
};

const createIncludeReader = (io = {}) => {
	const readFile = io.readFile || ((p) => readRegularFile(p));
	const readdir = io.readdir || ((p) => fs.readdirSync(p));
	const prefix = `${io.prefix || NGINX_CONF_PREFIX}`.replace(/\/*$/, "/");
	const fileCache = new Map();
	const scanCache = new Map();

	const read = (file) => {
		if (!fileCache.has(file)) {
			try {
				fileCache.set(file, { text: `${readFile(file)}` });
			} catch (err) {
				fileCache.set(file, { error: err });
			}
		}
		return fileCache.get(file);
	};

	const targets = (arg) => {
		const full = arg.startsWith("/") ? arg : `${prefix}${arg}`;
		return GLOB_CHARS.test(full) ? expandGlob(full, readdir) : [full];
	};

	const scan = (advancedConfig) => {
		const text = `${advancedConfig || ""}`;
		if (scanCache.has(text)) {
			return scanCache.get(text);
		}
		const result = { directives: new Set(), unreadable: false, files: [], usesUriVariable: false };
		const walk = (configText, chain, own) => {
			if (!INCLUDE_WORD.test(configText) && own) {
				return;
			}
			for (const statement of scanNginxConfig(configText).statements) {
				if (!own && !result.usesUriVariable && statement.tokens.some((token) => URI_VARIABLES.test(token))) {
					result.usesUriVariable = true;
				}
				if (statement.depth !== 0) {
					continue;
				}
				const name = statement.tokens[0];
				if (!own) {
					result.directives.add(name);
				}
				if (name !== "include" || statement.end === "{") {
					continue;
				}
				if (statement.tokens.length !== 2) {
					// nginx -t rejects it ("invalid number of arguments")
					result.unreadable = true;
					continue;
				}
				let files;
				try {
					files = targets(statement.tokens[1]);
				} catch {
					result.unreadable = true;
					continue;
				}
				for (const file of files) {
					// nginx has no depth limit: a cycle fails nginx -t ("too many open files")
					if (chain.includes(file) || chain.length >= MAX_DEPTH) {
						result.unreadable = true;
						continue;
					}
					const got = read(file);
					if (got.error) {
						result.unreadable = true;
						continue;
					}
					if (!result.files.includes(file)) {
						result.files.push(file);
					}
					walk(got.text, [...chain, file], false);
				}
			}
		};
		walk(text, [], true);
		scanCache.set(text, result);
		return result;
	};

	/**
	 * The rewrite-phase statements (set, if, rewrite, return, break, set_*, see REWRITE_PHASE) at the top level of
	 * the files an `include <arg>;` brings in, in nginx's order (a nested include in its place). A nested location
	 * runs none of its parent's, so the nested asset location repeats them, eg. an included
	 * `if ($http_x_token != secret) { return 403; }` guard (see assetAdvancedConfig() in lib/nginx-locations.js).
	 *
	 * @param   {String}  arg  the include's argument
	 * @returns {String[]|null} the statements, each on one line (Lua blocks as written); null when a file can't be read
	 */
	const rewritePhase = (arg, chain = []) => {
		let files;
		try {
			files = targets(arg);
		} catch {
			return null;
		}
		const out = [];
		for (const file of files) {
			if (chain.includes(file) || chain.length >= MAX_DEPTH) {
				return null;
			}
			const got = read(file);
			if (got.error) {
				return null;
			}
			const { statements } = scanNginxConfig(got.text);
			for (const statement of statements) {
				if (statement.depth !== 0) {
					continue;
				}
				const name = statement.tokens[0] || "";
				if (name === "include" && statement.end !== "{") {
					const nested = statement.tokens.length === 2 ? rewritePhase(statement.tokens[1], [...chain, file]) : null;
					if (nested === null) {
						return null;
					}
					out.push(...nested);
				} else if (REWRITE_PHASE.test(name) && (statement.end !== "{" || name === "if" || statement.lua)) {
					out.push(compactStatement(got.text, statement, statements));
				}
			}
		}
		return out;
	};

	return { scan, rewritePhase };
};

export { compactStatement, createIncludeReader, expandGlob, MAX_DEPTH, MAX_FILE_SIZE, NGINX_CONF_PREFIX, readRegularFile, URI_VARIABLES };
