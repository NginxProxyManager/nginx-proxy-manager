/**
 * A tokenizer for nginx configuration text that follows nginx's own reader (ngx_conf_read_token() in
 * src/core/ngx_conf_file.c) character by character:
 *
 * - `#` starts a comment and `"` / `'` start a quoted string only at the START of a token. In the middle of
 *   a token they are ordinary characters: `add_header X a"b;` is the token `a"b`, `return 301 /#/x;` the
 *   token `/#/x`.
 * - an unquoted token ends at whitespace, `;` or `{`, never at `}` (`return 200 x}` is the token `x}`).
 *   `}` is only a block end at the start of a token.
 * - `\` escapes the next character, `${` inside a token is part of a variable (`${host}`), not a block.
 * - in the token's value `\"`, `\'` and `\\` lose the backslash, `\t` `\r` `\n` become the control
 *   characters, any other backslash is kept (`\d` stays `\d`).
 *
 * The body of a `*_by_lua_block` directive (access_by_lua_block, set_by_lua_block $var, ...) is Lua code, which
 * lua-nginx-module reads with a lexer of its own, see skipLuaBlock().
 *
 * Text that nginx itself would reject (eg. `"a"b`, a stray `;`) is read on leniently: such a config fails
 * `nginx -t` anyway. `errors` lists what nginx would complain about.
 *
 * This module has no imports so it can be unit tested.
 */

const isSpace = (ch) => ch === " " || ch === "\t" || ch === "\r" || ch === "\n";

/**
 * @param   {String} raw  a token as written, without its surrounding quotes
 * @returns {String} the token's value as nginx sees it
 */
const unescapeToken = (raw) => {
	let out = "";
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === "\\" && i + 1 < raw.length) {
			const next = raw[i + 1];
			if (next === '"' || next === "'" || next === "\\") {
				out += next;
				i++;
				continue;
			}
			if (next === "t" || next === "r" || next === "n") {
				out += next === "t" ? "\t" : next === "r" ? "\r" : "\n";
				i++;
				continue;
			}
		}
		out += ch;
	}
	return out;
};

/**
 * @param   {String} src
 * @param   {Number} i  offset of a `[`
 * @returns {Number} the level of the Lua long bracket that starts there (the number of `=`, `[==[`), -1 for none
 */
const longBracketLevel = (src, i) => {
	let j = i + 1;
	while (src[j] === "=") {
		j++;
	}
	return src[j] === "[" ? j - i - 1 : -1;
};

/**
 * The end of the body of a `*_by_lua_block` directive, read as lua-nginx-module does (ngx_http_lua_conf_lua_block_parse()
 * in src/ngx_http_lua_directive.c and its lexer src/ngx_http_lua_lex.c): `{` and `}` are counted outside of
 *
 * - "..." and '...' strings, on one line, with `\` escaping the next character (a quote without its closing quote on
 *   the same line is an ordinary character),
 * - long strings `[[...]]`, `[==[...]==]` and long comments `--[[...]]`, `--[==[...]==]` (the closing bracket must
 *   have the same number of `=`; nginx -t fails without it),
 * - line comments `-- ...`.
 *
 * `#` is no comment in Lua (`#t` is the length of t), and `${` is nothing special.
 *
 * @param   {String} src
 * @param   {Number} from  offset just after the block's `{`
 * @returns {Number} offset just after the `}` that closes the block, -1 when the text ends before it
 */
const skipLuaBlock = (src, from) => {
	let level = 1;
	// For each quote character, the end of the line (or text) where the last string that started with it stayed
	// unclosed. A later quote of the same kind before that point is unclosed as well: the earlier scan stepped over
	// it as an escaped character and went on from the next one, exactly as a scan from it would. Without this, a line
	// of `\"` was rescanned to its end from every quote, quadratic in the line's length.
	const unclosedUntil = { '"': -1, "'": -1 };
	for (let i = from; i < src.length; i++) {
		const ch = src[i];
		if (ch === "{") {
			level++;
			continue;
		}
		if (ch === "}") {
			level--;
			if (level === 0) {
				return i + 1;
			}
			continue;
		}
		const comment = ch === "-" && src[i + 1] === "-";
		const bracket = comment ? i + 2 : i;
		if (src[bracket] === "[") {
			const eq = longBracketLevel(src, bracket);
			if (eq >= 0) {
				const close = src.indexOf(`]${"=".repeat(eq)}]`, bracket + eq + 2);
				if (close < 0) {
					return -1;
				}
				i = close + eq + 1;
				continue;
			}
		}
		if (comment) {
			const eol = src.indexOf("\n", i);
			if (eol < 0) {
				return -1;
			}
			i = eol;
			continue;
		}
		if ((ch === '"' || ch === "'") && i >= unclosedUntil[ch]) {
			let j = i + 1;
			while (j < src.length && src[j] !== ch && src[j] !== "\n") {
				j += src[j] === "\\" && src[j + 1] !== "\n" ? 2 : 1;
			}
			if (src[j] === ch) {
				i = j;
			} else {
				unclosedUntil[ch] = j;
			}
		}
	}
	return -1;
};

/**
 * @typedef  {Object} NginxStatement
 * @property {String[]} tokens  the statement's tokens (directive name first), unescaped
 * @property {String}   end     what ended it: ";", "{" (a block starts), "}" (a block ended right after
 *                              tokens without `;`, which nginx rejects) or "eof"
 * @property {Number}   depth   block depth the statement is in, 0 at the top
 * @property {Number}   start   offset of the statement's first token in the text (its quote, if quoted)
 * @property {Number}   [close] for a block ("{"): offset just after the `}` that closes it, unset while unclosed
 * @property {boolean}  [lua]   a `*_by_lua_block` directive: its block is Lua code, no statements are read from it
 *                              and it doesn't change the depth
 * @property {Number}   [stop]  for any other statement: offset just after it (after its `;`)
 */

/**
 * @param   {String} text
 * @returns {{statements: NginxStatement[], depth: Number, balanced: boolean, unterminated: boolean, errors: String[]}}
 *          depth: the block depth at the end, balanced: no `}` without a `{` and every block closed,
 *          unterminated: the text ends inside a quoted string
 */
const scanNginxConfig = (text) => {
	const src = `${text || ""}`;
	const statements = [];
	const errors = [];
	let tokens = [];
	let depth = 0;
	let negative = false;
	let luaUnclosed = false;

	// the state of ngx_conf_read_token()
	let lastSpace = true;
	let needSpace = false;
	let sharpComment = false;
	let quoted = false;
	let dQuoted = false;
	let sQuoted = false;
	let variable = false;
	let start = 0;
	// offset of the current statement's first token, -1 before it
	let statementStart = -1;
	// the open blocks, innermost last
	const open = [];

	const endStatement = (end, at) => {
		let statement = null;
		if (tokens.length || end === "{") {
			statement = { tokens, end, depth, start: statementStart < 0 ? at : statementStart };
			if (end !== "{") {
				statement.stop = end === ";" ? at + 1 : at;
			}
			statements.push(statement);
		}
		tokens = [];
		statementStart = -1;
		return statement;
	};
	// returns the offset to go on from: the `{`, or the last character of a Lua block
	const blockStart = (at) => {
		if (!tokens.length) {
			errors.push('unexpected "{"');
		}
		if (tokens.length && tokens[0].endsWith("_by_lua_block")) {
			const statement = endStatement("{", at);
			statement.lua = true;
			const close = skipLuaBlock(src, at + 1);
			if (close < 0) {
				luaUnclosed = true;
				errors.push('unexpected end of file, expecting "}" (Lua block)');
				return src.length;
			}
			statement.close = close;
			return close - 1;
		}
		open.push(endStatement("{", at));
		depth++;
		return at;
	};
	const blockEnd = (at) => {
		if (tokens.length) {
			errors.push('unexpected "}"');
			endStatement("}", at);
		}
		const block = open.pop();
		if (block) {
			block.close = at + 1;
		}
		depth--;
		if (depth < 0) {
			negative = true;
			errors.push('unexpected "}"');
			depth = 0;
		}
	};

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];

		if (sharpComment) {
			if (ch === "\n") {
				sharpComment = false;
			}
			continue;
		}

		if (needSpace) {
			if (isSpace(ch)) {
				lastSpace = true;
				needSpace = false;
				continue;
			}
			if (ch === ";") {
				needSpace = false;
				lastSpace = true;
				endStatement(";", i);
				continue;
			}
			if (ch === "{") {
				needSpace = false;
				lastSpace = true;
				i = blockStart(i);
				continue;
			}
			needSpace = false;
			lastSpace = true;
			if (ch !== ")") {
				errors.push(`unexpected "${ch}"`);
			}
			// falls through: the character starts the next token
		}

		if (lastSpace) {
			start = i;
			if (isSpace(ch)) {
				continue;
			}
			switch (ch) {
				case ";":
					if (!tokens.length) {
						errors.push('unexpected ";"');
					}
					endStatement(";", i);
					continue;
				case "{":
					i = blockStart(i);
					continue;
				case "}":
					blockEnd(i);
					continue;
				case "#":
					sharpComment = true;
					continue;
			}
			// a token starts here
			if (statementStart < 0) {
				statementStart = i;
			}
			switch (ch) {
				case "\\":
					quoted = true;
					lastSpace = false;
					continue;
				case '"':
					start = i + 1;
					dQuoted = true;
					lastSpace = false;
					continue;
				case "'":
					start = i + 1;
					sQuoted = true;
					lastSpace = false;
					continue;
				case "$":
					variable = true;
					lastSpace = false;
					continue;
				default:
					lastSpace = false;
					continue;
			}
		}

		if (ch === "{" && variable) {
			continue;
		}
		variable = false;
		if (quoted) {
			quoted = false;
			continue;
		}
		if (ch === "\\") {
			quoted = true;
			continue;
		}
		if (ch === "$") {
			variable = true;
			continue;
		}

		let found = false;
		if (dQuoted) {
			if (ch === '"') {
				dQuoted = false;
				needSpace = true;
				found = true;
			}
		} else if (sQuoted) {
			if (ch === "'") {
				sQuoted = false;
				needSpace = true;
				found = true;
			}
		} else if (isSpace(ch) || ch === ";" || ch === "{") {
			lastSpace = true;
			found = true;
		}

		if (found) {
			tokens.push(unescapeToken(src.slice(start, i)));
			if (ch === ";") {
				endStatement(";", i);
			} else if (ch === "{") {
				i = blockStart(i);
			}
		}
	}

	const unterminated = dQuoted || sQuoted;
	if (!lastSpace && !needSpace && !unterminated && !sharpComment) {
		// a token running to the end of the text
		tokens.push(unescapeToken(src.slice(start)));
	}
	if (unterminated) {
		errors.push("unexpected end of file, expecting closing quote");
	}
	if (tokens.length) {
		errors.push('unexpected end of file, expecting ";" or "}"');
		endStatement("eof", src.length);
	}
	if (depth > 0) {
		errors.push('unexpected end of file, expecting "}"');
	}
	return { statements, depth, balanced: !negative && depth === 0 && !luaUnclosed, unterminated, errors };
};

export { scanNginxConfig, skipLuaBlock, unescapeToken };
