// redactConfigError: a "global" nginx error names the host that broke nginx. Users only see the details of
// a host they can see: their own, or a proxy host shared with them in permissions.meta.proxy_host_ids.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { access, db, load, ts, userAccess } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");

const OTHER_USER = 2;
const ME = 3;

const globalError = (hostType, hostId) =>
	new errs.NginxConfigError('unknown directive "bogus"', {
		kind: "nginx_config",
		scope: "global",
		host_type: hostType,
		host_id: hostId,
		file: `/data/nginx/${hostType}/${hostId}.conf`,
		line: 3,
		nginx_output: "nginx: [emerg] unknown directive",
	});

const isRedacted = (err) => err.details.host_id === null && err.details.nginx_output === null;

before(async () => {
	for (const id of [OTHER_USER, ME]) {
		await db("user").insert({
			id,
			name: `User ${id}`,
			nickname: `u${id}`,
			email: `u${id}@example.com`,
			avatar: "",
			roles: "[]",
			...ts,
		});
	}
	const proxy = { forward_scheme: "http", forward_host: "app", forward_port: 80, is_deleted: 0, meta: "{}", ...ts };
	await db("proxy_host").insert([
		{ id: 1, owner_user_id: OTHER_USER, domain_names: '["other.example.com"]', ...proxy },
		{ id: 2, owner_user_id: OTHER_USER, domain_names: '["shared.example.com"]', ...proxy },
		{ id: 3, owner_user_id: ME, domain_names: '["mine.example.com"]', ...proxy },
		{ id: 4, owner_user_id: OTHER_USER, domain_names: '["deleted.example.com"]', ...proxy, is_deleted: 1 },
	]);
	await db("redirection_host").insert({
		id: 2,
		owner_user_id: OTHER_USER,
		domain_names: '["redirect.example.com"]',
		forward_scheme: "http",
		forward_domain_name: "target.example.com",
		forward_http_code: 301,
		meta: "{}",
		...ts,
	});
});

after(async () => {
	await db.destroy();
});

describe("redactConfigError", () => {
	const user = userAccess({ userId: ME, visibility: "user", meta: { proxy_host_ids: [2, 4] } });

	it("shows the details to a user who can see all hosts", async () => {
		assert.ok(!isRedacted(await internalNginx.redactConfigError(access, globalError("proxy_host", 1))));
	});

	it("shows the details of the user's own host", async () => {
		assert.ok(!isRedacted(await internalNginx.redactConfigError(user, globalError("proxy_host", 3))));
	});

	it("shows the details of a proxy host shared with the user", async () => {
		const err = await internalNginx.redactConfigError(user, globalError("proxy_host", 2));
		assert.ok(!isRedacted(err));
		assert.equal(err.details.host_id, 2);
	});

	it("redacts another user's host that isn't shared", async () => {
		const err = await internalNginx.redactConfigError(user, globalError("proxy_host", 1));
		assert.ok(isRedacted(err));
		assert.match(err.message, /another host/);
	});

	it("redacts a shared proxy host that was deleted", async () => {
		assert.ok(isRedacted(await internalNginx.redactConfigError(user, globalError("proxy_host", 4))));
	});

	it("only shares proxy hosts: the same id of another host type stays redacted", async () => {
		assert.ok(isRedacted(await internalNginx.redactConfigError(user, globalError("redirection_host", 2))));
	});

	const hostless = (file) =>
		new errs.NginxConfigError(`Nginx configuration error in ${file} (line 2): host not found in upstream "db.internal".`, {
			kind: "nginx_config",
			scope: "global",
			host_type: null,
			host_id: null,
			file,
			line: 2,
			nginx_output: `nginx: [emerg] host not found in upstream "db.internal" in ${file}:2`,
			detail: 'Host not found in upstream "db.internal".',
			hint: null,
		});

	it("redacts a global error that names no host for a user who can't see all hosts", async () => {
		for (const file of ["/data/nginx/custom/http.conf", null]) {
			const err = await internalNginx.redactConfigError(user, hostless(file));
			assert.ok(isRedacted(err));
			assert.equal(err.details.file, null);
			assert.equal(err.details.detail, null);
			assert.equal(err.details.reason, "redacted");
			assert.doesNotMatch(err.message, /db\.internal|custom/);
		}
	});

	it("shows a global error that names no host to admins and users who can see all hosts", async () => {
		for (const who of [access, userAccess({ userId: ME, visibility: "all" })]) {
			const err = await internalNginx.redactConfigError(who, hostless("/data/nginx/custom/http.conf"));
			assert.equal(err.details.file, "/data/nginx/custom/http.conf");
			assert.match(err.details.nginx_output, /db\.internal/);
			assert.match(err.message, /db\.internal/);
		}
	});

	it("keeps the fixed too-many-broken-hosts error", async () => {
		const err = new errs.NginxConfigError("Too many broken host configs", {
			kind: "nginx_config",
			scope: "global",
			reason: "too_many_broken_hosts",
			max: 10,
		});
		assert.equal((await internalNginx.redactConfigError(user, err)).details.reason, "too_many_broken_hosts");
	});

	const withWarnings = (scope, hostId) =>
		new errs.NginxConfigError('unknown directive "bogus"', {
			kind: "nginx_config",
			scope,
			host_type: "proxy_host",
			host_id: hostId,
			file: `/data/nginx/proxy_host/${hostId}.conf`,
			line: 3,
			nginx_output: [
				'nginx: [warn] conflicting server name "other.example.com" on 0.0.0.0:80, ignored',
				"nginx: [warn] protocol options redefined for 0.0.0.0:443 in /data/nginx/proxy_host/1.conf:20",
				`nginx: [warn] "ssl_stapling" ignored in /data/nginx/proxy_host/${hostId}.conf:9`,
				`nginx: [emerg] unknown directive "bogus" in /data/nginx/proxy_host/${hostId}.conf:3`,
			].join("\n"),
		});

	it("only keeps the nginx output lines about the user's own host", async () => {
		for (const err of [withWarnings("host", 3), withWarnings("global", 3)]) {
			const out = (await internalNginx.redactConfigError(user, err)).details.nginx_output;
			assert.equal(
				out,
				[
					'nginx: [warn] "ssl_stapling" ignored in /data/nginx/proxy_host/3.conf:9',
					'nginx: [emerg] unknown directive "bogus" in /data/nginx/proxy_host/3.conf:3',
				].join("\n"),
			);
		}
	});

	it("keeps all nginx output for users who can see all hosts", async () => {
		const err = await internalNginx.redactConfigError(access, withWarnings("host", 3));
		assert.match(err.details.nginx_output, /other\.example\.com/);
		assert.match(err.details.nginx_output, /proxy_host\/1\.conf/);
	});

	it("redacts global errors for a user with visibility all who can't list every host type", async () => {
		// eg. a streams-only manager: visibility "all", proxy hosts hidden
		const streamsOnly = userAccess({ userId: ME, visibility: "all", hidden: ["proxy_hosts"] });
		assert.equal(internalNginx.canSeeAllHosts(streamsOnly), false);
		const named = await internalNginx.redactConfigError(streamsOnly, withWarnings("global", 5));
		assert.ok(isRedacted(named));
		assert.equal(named.details.host_id, null);
		assert.equal(named.details.nginx_output, null);
		const hostless_ = await internalNginx.redactConfigError(streamsOnly, hostless("/data/nginx/custom/http.conf"));
		assert.ok(isRedacted(hostless_));
		assert.equal(hostless_.details.nginx_output, null);
		// and only gets its own lines of a host-scope error about a stream
		const own = await internalNginx.redactConfigError(streamsOnly, withWarnings("host", 3));
		assert.doesNotMatch(own.details.nginx_output, /other\.example\.com|proxy_host\/1\.conf/);
	});
});

describe("buildOfflineMeta", () => {
	it("keeps only the nginx output lines about the host's own error", () => {
		const err = new errs.NginxConfigError('unknown directive "bogus"', {
			kind: "nginx_config",
			scope: "host",
			host_type: "proxy_host",
			host_id: 3,
			file: "/data/nginx/proxy_host/3.conf",
			line: 3,
			nginx_output: [
				'nginx: [warn] conflicting server name "other.example.com" on 0.0.0.0:80, ignored',
				"nginx: [warn] protocol options redefined for 0.0.0.0:443 in /data/nginx/proxy_host/1.conf:20",
				'nginx: [emerg] unknown directive "bogus" in /data/nginx/proxy_host/3.conf:3',
			].join("\n"),
		});
		for (const prefix of ["", "Disabled automatically: "]) {
			const meta = internalNginx.buildOfflineMeta({ letsencrypt_agree: false }, err, null, prefix);
			assert.equal(meta.nginx_online, false);
			assert.equal(meta.nginx_details.nginx_output, 'nginx: [emerg] unknown directive "bogus" in /data/nginx/proxy_host/3.conf:3');
			assert.equal(meta.nginx_details.file, "/data/nginx/proxy_host/3.conf");
		}
		// the error itself is left alone
		assert.match(err.details.nginx_output, /other\.example\.com/);
	});
});
