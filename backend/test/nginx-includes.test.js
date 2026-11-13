import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createIncludeReader, expandGlob, MAX_DEPTH, readRegularFile } from "../lib/nginx-includes.js";
import {
	buildLocationContext,
	chooseLocationMode,
	prepareLocation,
	readLocationTemplate,
	renderLocation,
} from "../lib/nginx-locations.js";
import utils from "../lib/utils.js";

const err = (code) => Object.assign(new Error(code), { code });

// A file system of { "/abs/path": "text" | Error }; directories are derived from the paths
const fakeFs = (files, { unlistable = [] } = {}) => {
	const reads = [];
	const readFile = (p) => {
		reads.push(p);
		const v = files[p];
		if (v === undefined) {
			throw err("ENOENT");
		}
		if (v instanceof Error) {
			throw v;
		}
		return v;
	};
	const readdir = (dir) => {
		if (unlistable.includes(dir)) {
			throw err("EACCES");
		}
		const base = dir.endsWith("/") ? dir : `${dir}/`;
		const names = new Set();
		for (const p of Object.keys(files)) {
			if (p.startsWith(base)) {
				names.add(p.slice(base.length).split("/")[0]);
			}
		}
		if (!names.size) {
			throw err("ENOENT");
		}
		return [...names];
	};
	return { readFile, readdir, reads };
};

describe("createIncludeReader", () => {
	it("reads the top-level statements of an included file", () => {
		const io = fakeFs({ "/snippets/off.conf": "proxy_redirect off;\nif ($x) { add_header X 1; }\n" });
		const got = createIncludeReader(io).scan("include /snippets/off.conf;");
		assert.equal(got.unreadable, false);
		assert.deepEqual([...got.directives].sort(), ["if", "proxy_redirect"]);
		assert.deepEqual(got.files, ["/snippets/off.conf"]);
	});

	it("finds a proxy_redirect with a value, but not one inside a block", () => {
		const io = fakeFs({
			"/s/a.conf": "proxy_redirect  http://  $scheme://;",
			"/s/b.conf": "if ($x) { proxy_redirect off; }\nlocation /i/ { proxy_redirect off; }",
		});
		const reader = createIncludeReader(io);
		assert.equal(reader.scan("include /s/a.conf;").directives.has("proxy_redirect"), true);
		assert.equal(reader.scan("include /s/b.conf;").directives.has("proxy_redirect"), false);
	});

	it("only follows includes at the top level of the advanced config, and ignores comments and Lua code", () => {
		const io = fakeFs({ "/s/a.conf": "proxy_redirect off;" });
		const reader = createIncludeReader(io);
		for (const adv of [
			"if ($x) { include /s/a.conf; }",
			"# include /s/a.conf;",
			"access_by_lua_block { -- include /s/a.conf;\n }",
			"add_header X include;",
		]) {
			const got = reader.scan(adv);
			assert.equal(got.directives.size, 0, adv);
			assert.equal(got.unreadable, false, adv);
		}
		assert.deepEqual(io.reads, []);
	});

	it("resolves relative paths against the nginx prefix, also in a nested include", () => {
		const io = fakeFs({
			"/etc/nginx/conf.d/include/a.conf": "include b.conf;",
			"/etc/nginx/b.conf": "include /s/c.conf;",
			"/s/c.conf": "proxy_redirect http://x/ /;",
		});
		const got = createIncludeReader(io).scan("include conf.d/include/a.conf;");
		assert.equal(got.unreadable, false);
		assert.equal(got.directives.has("proxy_redirect"), true);
		assert.deepEqual(got.files, ["/etc/nginx/conf.d/include/a.conf", "/etc/nginx/b.conf", "/s/c.conf"]);
		assert.equal(createIncludeReader({ ...io, prefix: "/opt/ng" }).scan("include b.conf;").unreadable, true);
	});

	it("expands globs as glob(3) does: no match is no error, a wildcard doesn't match a leading dot", () => {
		const io = fakeFs({
			"/data/nginx/custom/server_proxy.conf": "add_header X 1;",
			"/s/a.conf": "add_header A 1;",
			"/s/b.conf": "proxy_redirect off;",
			"/s/.hidden.conf": "deny all;",
			"/s/c.txt": "allow all;",
			"/s/sub/d.conf": "expires 1h;",
		});
		const reader = createIncludeReader(io);
		const got = reader.scan("include /s/*.conf;");
		assert.deepEqual(got.files, ["/s/a.conf", "/s/b.conf"]);
		assert.equal(got.directives.has("proxy_redirect"), true);
		assert.equal(got.directives.has("deny"), false);
		assert.deepEqual(reader.scan("include /data/nginx/custom/server_proxy[.]conf;").files, [
			"/data/nginx/custom/server_proxy.conf",
		]);
		const none = reader.scan("include /data/nginx/custom/http[.]conf; include /nope/*.conf;");
		assert.equal(none.unreadable, false);
		assert.deepEqual(none.files, []);
		assert.deepEqual(reader.scan("include /s/*/?.conf;").files, ["/s/sub/d.conf"]);
		assert.deepEqual(reader.scan("include /s/.h*;").files, ["/s/.hidden.conf"]);
		assert.deepEqual(reader.scan("include /s/[!a]*.c[a-z]nf;").files, ["/s/b.conf"]);
		assert.deepEqual(reader.scan("include /s/\\*.conf;").files, []);
	});

	it("reports what it can't read: a missing file, no permission, a directory it can't list", () => {
		const io = fakeFs({ "/s/secret.conf": err("EACCES"), "/s/ok.conf": "proxy_redirect off;" }, { unlistable: ["/locked"] });
		const reader = createIncludeReader(io);
		assert.equal(reader.scan("include /s/missing.conf;").unreadable, true);
		assert.equal(reader.scan("include /s/secret.conf;").unreadable, true);
		assert.equal(reader.scan("include /locked/*.conf;").unreadable, true);
		assert.equal(reader.scan("include /s/a.conf /s/b.conf;").unreadable, true);
		// what can be read is still read
		const mixed = reader.scan("include /s/missing.conf; include /s/ok.conf;");
		assert.equal(mixed.unreadable, true);
		assert.equal(mixed.directives.has("proxy_redirect"), true);
	});

	it("stops at a cycle and at MAX_DEPTH", () => {
		const io = fakeFs({ "/s/a.conf": "include /s/b.conf;", "/s/b.conf": "include /s/a.conf;" });
		assert.equal(createIncludeReader(io).scan("include /s/a.conf;").unreadable, true);
		const deep = {};
		for (let i = 0; i <= MAX_DEPTH; i++) {
			deep[`/d/${i}.conf`] = `include /d/${i + 1}.conf;`;
		}
		deep[`/d/${MAX_DEPTH + 1}.conf`] = "proxy_redirect off;";
		assert.equal(createIncludeReader(fakeFs(deep)).scan("include /d/0.conf;").unreadable, true);
		// the same file twice side by side is no cycle
		const twice = fakeFs({ "/s/h.conf": "add_header X 1;" });
		assert.equal(createIncludeReader(twice).scan("include /s/h.conf; include /s/h.conf;").unreadable, false);
	});

	it("reads every file once per reader", () => {
		const io = fakeFs({ "/s/a.conf": "proxy_redirect off;" });
		const reader = createIncludeReader(io);
		reader.scan("include /s/a.conf;");
		reader.scan("include /s/a.conf;\nadd_header X 1;");
		assert.deepEqual(io.reads, ["/s/a.conf"]);
	});

	it("expandGlob sorts the matches", () => {
		const readdir = (dir) => ({ "/": ["s"], "/s": ["b.conf", "a.conf", "C.conf"] })[dir] || [];
		assert.deepEqual(expandGlob("/s/*.conf", readdir), ["/s/C.conf", "/s/a.conf", "/s/b.conf"]);
	});
});

describe("locations with an included proxy_redirect", () => {
	const engine = utils.getRenderEngine();
	const template = readLocationTemplate();
	const host = {
		access_list_id: 0,
		certificate_id: 0,
		ssl_forced: false,
		caching_enabled: false,
		block_exploits: false,
		allow_websocket_upgrade: false,
		http2_support: false,
		hsts_enabled: false,
		hsts_subdomains: false,
		access_list: null,
		certificate: null,
	};
	const io = fakeFs({
		"/snippets/off.conf": "proxy_redirect off;",
		"/snippets/val.conf": "proxy_redirect http://app:8080/ /moved/;",
		"/snippets/hdr.conf": "proxy_set_header X-A a;",
		"/snippets/nested.conf": "include /snippets/off.conf;",
	});
	const loc = (adv, extra = {}) =>
		Object.assign(
			{},
			host,
			prepareLocation({
				path: "/app/",
				forward_scheme: "http",
				forward_host: "app",
				forward_port: 8080,
				forward_path: "/x/",
				advanced_config: adv,
				...extra,
			}),
		);
	const dynamicOk = { mode: "dynamic", status: "ok" };

	it("writes no redirect line of its own for an included proxy_redirect", async () => {
		for (const adv of [
			"include /snippets/off.conf;",
			"include /snippets/val.conf;",
			"include /snippets/nested.conf;",
			"include /snippets/[ov]*.conf;",
		]) {
			const includes = createIncludeReader(io);
			const l = loc(adv, { caching_enabled: true });
			assert.deepEqual(chooseLocationMode(l, dynamicOk, includes), dynamicOk, adv);
			const ctx = buildLocationContext(l, { index: 0, mode: "dynamic", includes });
			assert.equal(ctx.npm_redirect, "", adv);
			assert.equal(ctx.npm_asset_redirect, "", adv);
			const out = await renderLocation(engine, template, l, { index: 0, status: "ok", mode: "dynamic", includes });
			assert.doesNotMatch(out, /proxy_redirect +http:\/\/\$npm_loc|proxy_redirect +http:\/\/app:8080\/x\/ \/app\//, adv);
		}
	});

	it("keeps its redirect line when the included files set none", () => {
		const includes = createIncludeReader(io);
		const ctx = buildLocationContext(loc("include /snippets/hdr.conf;"), { index: 0, mode: "dynamic", includes });
		assert.equal(ctx.npm_redirect, "http://app:8080/x/ /app/");
	});

	it("stays static while the host resolves when an include can't be read", () => {
		for (const adv of ["include /snippets/missing.conf;", "include /snippets/hdr.conf; include /gone.conf;"]) {
			assert.deepEqual(chooseLocationMode(loc(adv), dynamicOk, createIncludeReader(io)), { mode: "static", status: "ok" }, adv);
			// an unknown literal host fails nginx -t for every host, it stays dynamic
			const unresolved = { mode: "dynamic", status: "unresolved" };
			assert.deepEqual(chooseLocationMode(loc(adv), unresolved, createIncludeReader(io)), unresolved, adv);
			assert.deepEqual(chooseLocationMode(loc(adv), { mode: "static", status: "ok" }, createIncludeReader(io)), {
				mode: "static",
				status: "ok",
			});
		}
		assert.deepEqual(chooseLocationMode(loc("include /snippets/hdr.conf;"), dynamicOk, createIncludeReader(io)), dynamicOk);
	});
});

describe("locations with an included file that reads $uri", () => {
	const io = fakeFs({
		"/snippets/headers.conf": "proxy_set_header X-Original-URI $uri;",
		"/snippets/outer.conf": "include /snippets/inner.conf;",
		"/snippets/inner.conf": "if ($http_x) {\n  add_header X-Doc ${document_uri};\n}",
		"/snippets/plain.conf": "proxy_set_header X-A a; # $uri in a comment",
		"/snippets/request.conf": "proxy_set_header X-R $request_uri; proxy_set_header X-U $uri_x;",
	});
	const loc = (adv) =>
		prepareLocation({
			path: "/api/",
			forward_scheme: "http",
			forward_host: "app",
			forward_port: 80,
			forward_path: "/v1/",
			advanced_config: adv,
		});
	const dynamicOk = { mode: "dynamic", status: "ok" };
	const staticOk = { mode: "static", status: "ok" };

	it("stays static while the host resolves, as for $uri written directly", () => {
		assert.deepEqual(
			chooseLocationMode(loc("include /snippets/headers.conf;"), dynamicOk, createIncludeReader(io)),
			staticOk,
		);
		assert.deepEqual(
			chooseLocationMode(loc("include /snippets/outer.conf;"), dynamicOk, createIncludeReader(io)),
			staticOk,
		);
		assert.deepEqual(
			chooseLocationMode(loc("include /snippets/h*.conf;"), dynamicOk, createIncludeReader(io)),
			staticOk,
		);
	});

	it("stays dynamic for included files without $uri or $document_uri, and while the host doesn't resolve", () => {
		for (const adv of ["include /snippets/plain.conf;", "include /snippets/request.conf;"]) {
			assert.deepEqual(chooseLocationMode(loc(adv), dynamicOk, createIncludeReader(io)), dynamicOk, adv);
		}
		const unresolved = { mode: "dynamic", status: "unresolved" };
		assert.deepEqual(
			chooseLocationMode(loc("include /snippets/headers.conf;"), unresolved, createIncludeReader(io)),
			unresolved,
		);
	});

	it("reports the variable from the include reader", () => {
		assert.equal(createIncludeReader(io).scan("include /snippets/outer.conf;").usesUriVariable, true);
		assert.equal(createIncludeReader(io).scan("include /snippets/plain.conf;").usesUriVariable, false);
		// the advanced config itself is checked by chooseLocationMode()
		assert.equal(createIncludeReader(io).scan("add_header X $uri;").usesUriVariable, false);
	});
});

describe("readRegularFile", () => {
	it("reads a regular file and refuses a bigger one", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-inc-"));
		try {
			const file = path.join(dir, "a.conf");
			fs.writeFileSync(file, "proxy_redirect off;");
			assert.equal(readRegularFile(file), "proxy_redirect off;");
			assert.throws(() => readRegularFile(file, 5), { code: "ENOTREGULAR" });
			assert.throws(() => readRegularFile(path.join(dir, "missing.conf")), { code: "ENOENT" });
			assert.throws(() => readRegularFile(dir), { code: "ENOTREGULAR" });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("reads a device as empty without reading from it", () => {
		for (const dev of ["/dev/null", "/dev/zero", "/dev/urandom"]) {
			if (fs.existsSync(dev)) {
				assert.equal(readRegularFile(dev), "", dev);
			}
		}
		const reader = createIncludeReader();
		const got = reader.scan("include /dev/zero;\ninclude /dev/urandom;");
		assert.equal(got.unreadable, false);
		assert.equal(got.directives.size, 0);
	});

	it("refuses a FIFO and a socket without blocking", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-inc-"));
		const server = net.createServer();
		try {
			const sock = path.join(dir, "s.sock");
			await new Promise((resolve) => server.listen(sock, resolve));
			assert.throws(() => readRegularFile(sock), { code: "ENOTREGULAR" });
			let fifo = null;
			try {
				execFileSync("mkfifo", [path.join(dir, "f.conf")]);
				fifo = path.join(dir, "f.conf");
			} catch {
				// no mkfifo here
			}
			if (fifo) {
				assert.throws(() => readRegularFile(fifo), { code: "ENOTREGULAR" });
				assert.equal(createIncludeReader().scan(`include ${dir}/*.conf;`).unreadable, true);
			}
		} finally {
			await new Promise((resolve) => server.close(resolve));
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
