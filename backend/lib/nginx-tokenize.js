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
 * @typedef  {Object} NginxStatement
 * @property {String[]} tokens  the statement's tokens (directive name first), unescaped
 * @property {String}   end     what ended it: ";", "{" (a block starts), "}" (a block ended right after
 *                              tokens without `;`, which nginx rejects) or "eof"
 * @property {Number}   depth   block depth the statement is in, 0 at the top
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

	// the state of ngx_conf_read_token()
	let lastSpace = true;
	let needSpace = false;
	let sharpComment = false;
	let quoted = false;
	let dQuoted = false;
	let sQuoted = false;
	let variable = false;
	let start = 0;

	const endStatement = (end) => {
		if (tokens.length || end === "{") {
			statements.push({ tokens, end, depth });
		}
		tokens = [];
	};
	const blockStart = () => {
		if (!tokens.length) {
			errors.push('unexpected "{"');
		}
		endStatement("{");
		depth++;
	};
	const blockEnd = () => {
		if (tokens.length) {
			errors.push('unexpected "}"');
			endStatement("}");
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
				endStatement(";");
				continue;
			}
			if (ch === "{") {
				needSpace = false;
				lastSpace = true;
				blockStart();
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
					endStatement(";");
					continue;
				case "{":
					blockStart();
					continue;
				case "}":
					blockEnd();
					continue;
				case "#":
					sharpComment = true;
					continue;
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
				endStatement(";");
			} else if (ch === "{") {
				blockStart();
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
		endStatement("eof");
	}
	if (depth > 0) {
		errors.push('unexpected end of file, expecting "}"');
	}
	return { statements, depth, balanced: !negative && depth === 0, unterminated, errors };
};

export { scanNginxConfig, unescapeToken };
