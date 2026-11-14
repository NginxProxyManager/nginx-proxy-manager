import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanNginxConfig, skipLuaBlock } from "../lib/nginx-tokenize.js";

// `<directive> { <body> }` followed by a statement, read as nginx with lua-nginx-module reads it
const luaBlock = (body, directive = "access_by_lua_block") => scanNginxConfig(`${directive} {${body}}\nadd_header X-After 1;`);

describe("scanNginxConfig, *_by_lua_block", () => {
	it("reads the body of a Lua block with Lua's rules, like lua-nginx-module", () => {
		// every one of these passes nginx -t (openresty 1.31, lua-nginx-module 0.10.31) and the add_header after it
		// applies
		for (const body of [
			" -- deny unless header }\n ngx.var.x = 1 ",
			" local t = {1} ",
			' local s = "}" ',
			" local s = '}' ",
			" local s = [[ } ]] ",
			" local s = [==[ ]] } ]==] ",
			" --[[ } ]] ",
			" --[==[ \n } ]] \n ]==] ",
			" --[ } \n",
			' local s = "a\\"}" ',
			' local s = "\\\\" local t = "}" ',
			" local t = #{} ",
			' -- comment with " quote\n local s = "}" ',
			' local s = "--" local t = {} ',
			" local s = '[[' local u = \"}\" ",
			" local s = [=[ ]] ]=] ",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: nginx ${var} syntax, not a JS template
			' ngx.say("${x}") ',
			" local s = [[\n}]] ",
			" local a = { { } } ",
			" -- don't }\n",
			" local a = {} local b = a[a[1]] ",
			" local s = 'a\\'}' ",
			' local s = "a" .. [[}]] -- }\n',
			' local s = "" local t = { "}", \'{\' } ',
			' local s = "a" -- " }\n',
			' ngx.var.x = "#" ',
			" local s = [==[ ]=] } ]==] ",
			" --[[ ]]-- } \n",
			"\n  if ngx.var.http_x_token ~= \"secret\" then return ngx.exit(403) end -- {\n",
		]) {
			const scan = luaBlock(body);
			assert.equal(scan.balanced, true, body);
			assert.deepEqual(scan.errors, [], body);
			assert.deepEqual(
				scan.statements.map((s) => [s.tokens[0], s.depth, !!s.lua]),
				[
					["access_by_lua_block", 0, true],
					["add_header", 0, false],
				],
				body,
			);
			assert.equal(scan.statements[0].close, `access_by_lua_block {${body}}`.length, body);
		}
	});

	it("finds the end of a Lua block where lua-nginx-module does", () => {
		// each of these fails nginx -t: the block ends early, or not at all
		for (const body of [
			// a string ends at the end of its line (also after a backslash)
			' local s = "a\\\n}" ',
			' local s = "a\n}" ',
			' local s = "x }\n',
			// `#` is no comment, `[ [` no long bracket, a long comment ends at its bracket
			"\n# not a comment in lua }\n",
			" local s = [ [ } ] ] ",
			" --[[ ]] } ",
			// unterminated long comment
			" --[=[ unterminated }\n",
		]) {
			const scan = luaBlock(body);
			assert.ok(!scan.balanced || scan.errors.length || scan.unterminated, body);
		}
	});

	it("knows every *_by_lua_block directive, with arguments and without a space before the block", () => {
		const text = [
			'set_by_lua_block $v { return "}" -- }\n }',
			"rewrite_by_lua_block{ local t = {1} }",
			'"header_filter_by_lua_block" { ngx.header["X-H"] = "}" }',
			"body_filter_by_lua_block { -- }\n }",
			"log_by_lua_block { local s = [[}]] }",
			"ssl_certificate_by_lua_block { -- }\n }",
			"balancer_by_lua_block { } content_by_lua_block { ngx.say('{') }",
			'if ($x) { set_by_lua_block $w {return "}"} }',
			"set $after 1;",
		].join("\n");
		const scan = scanNginxConfig(text);
		assert.equal(scan.balanced, true);
		assert.deepEqual(scan.errors, []);
		assert.deepEqual(
			scan.statements.map((s) => `${s.depth} ${s.tokens.join(" ")}${s.lua ? " (lua)" : ""}`),
			[
				"0 set_by_lua_block $v (lua)",
				"0 rewrite_by_lua_block (lua)",
				"0 header_filter_by_lua_block (lua)",
				"0 body_filter_by_lua_block (lua)",
				"0 log_by_lua_block (lua)",
				"0 ssl_certificate_by_lua_block (lua)",
				"0 balancer_by_lua_block (lua)",
				"0 content_by_lua_block (lua)",
				"0 if ($x)",
				"1 set_by_lua_block $w (lua)",
				"0 set $after 1",
			],
		);
	});

	it("reports an unclosed Lua block", () => {
		for (const text of ["access_by_lua_block { local t = {1}", "access_by_lua_block { -- }", "access_by_lua_block { [[ } "]) {
			const scan = scanNginxConfig(text);
			assert.equal(scan.balanced, false, text);
			assert.equal(scan.statements.length, 1, text);
			assert.equal(scan.statements[0].close, undefined, text);
		}
	});

	it("reads other blocks and *_by_lua directives with a string as before", () => {
		const scan = scanNginxConfig("access_by_lua 'return }'; location /x { # }\n return 200 '{'; }");
		assert.equal(scan.balanced, true);
		assert.deepEqual(
			scan.statements.map((s) => s.tokens),
			[["access_by_lua", "return }"], ["location", "/x"], ["return", "200", "{"]],
		);
	});
});

describe("skipLuaBlock with unclosed strings", () => {
	it("treats a quote without its closing quote on the line as an ordinary character", () => {
		// the `}` after an unclosed quote still closes the block
		assert.equal(skipLuaBlock(' "a \\" }', 0), 8);
		// an unclosed ' doesn't hide a later "..." string
		assert.equal(skipLuaBlock(" 'a \\' \" } \" }", 0), 14);
		// a string ends at the end of its line, a quote on the next line starts a new one
		assert.equal(skipLuaBlock(' "x\n" } "', 0), -1);
		assert.equal(skipLuaBlock(' "x\n" } " }', 0), 11);
		// '...' inside "..." is part of the string
		assert.equal(skipLuaBlock(" \"\\\" '\\' } ' } \" }", 0), 18);
	});

	it("reads long lines of escaped quotes in linear time", () => {
		// every quote of `"\"\"\"...` started a scan to the end of the line: 90 KB took 2.8 s
		for (const text of [
			`content_by_lua_block { "${'\\"'.repeat(45000)} }`,
			`content_by_lua_block { '${"\\'".repeat(45000)} }`,
			`content_by_lua_block { "'${"\\'\\\"".repeat(22000)} }`,
		]) {
			const start = performance.now();
			const scan = scanNginxConfig(text);
			assert.ok(performance.now() - start < 100, text.slice(0, 30));
			assert.equal(scan.statements.length, 1);
			assert.ok(scan.balanced);
		}
	});
});

