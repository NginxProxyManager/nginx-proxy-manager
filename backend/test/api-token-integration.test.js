import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mock, test } from "node:test";

// Runs with a disposable /data filesystem. Never points at an existing NPM DB.
// Command from backend: node --test test/api-token-integration.test.js
if (process.env.NPM_API_TOKEN_TEST !== "1") {
	test("PAT integration in disposable Bubblewrap environment", () => {
		const childEnv = {
			...process.env,
			NPM_API_TOKEN_TEST: "1",
			NODE_CONFIG_DIR: "/data/empty-config",
			DB_SQLITE_FILE: "/data/test.sqlite",
		};
		delete childEnv.NODE_TEST_CONTEXT;
		const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
		const result = spawnSync(
			"bwrap",
			[
				"--tmpfs",
				"/",
				"--ro-bind",
				"/usr",
				"/usr",
				...(existsSync("/opt") ? ["--ro-bind", "/opt", "/opt"] : []),
				"--ro-bind",
				"/etc",
				"/etc",
				"--tmpfs",
				"/tmp",
				"--ro-bind",
				repositoryRoot,
				repositoryRoot,
				"--symlink",
				"usr/bin",
				"/bin",
				"--symlink",
				"usr/lib",
				"/lib",
				"--symlink",
				"usr/lib64",
				"/lib64",
				"--proc",
				"/proc",
				"--dev",
				"/dev",
				"--dir",
				"/data",
				"--",
				process.execPath,
				"--test",
				fileURLToPath(import.meta.url),
			],
			{
				env: childEnv,
				encoding: "utf8",
				timeout: 180000,
				maxBuffer: 10 * 1024 * 1024,
			},
		);
		assert.equal(
			result.status,
			0,
			`Isolated integration failed: ${result.error || ""}\n${result.stdout}\n${result.stderr}`,
		);
		assert.ok(result.stdout.includes("PAT real database"), "inner test suite must actually execute");
		console.log(result.stdout);
	});
} else {
	await test("PAT real database, Express, password/JWT and authorization", async (t) => {
		const { migrateUp } = await import("../migrate.js");
		await migrateUp();
		const { getCompiledSchema } = await import("../schema/index.js");
		const schema = await getCompiledSchema();
		const db = (await import("../db.js")).default;
		const User = (await import("../models/user.js")).default;
		const Auth = (await import("../models/auth.js")).default;
		const Permission = (await import("../models/user_permission.js")).default;
		const ApiToken = (await import("../models/api_token.js")).default;
		const Audit = (await import("../models/audit-log.js")).default;
		const { resources, hashSecret, tokenPattern } = await import("../lib/api-token-policy.js");
		const nginx = (await import("../internal/nginx.js")).default;
		let mutations = 0;
		let acmeCalls = 0;
		const certificateOperations = (await import("../internal/certificate.js")).default;
		for (const name of ["requestLetsEncryptSsl", "requestLetsEncryptSslWithDnsChallenge"]) {
			mock.method(certificateOperations, name, async () => {
				acmeCalls++;
				throw new Error("External ACME disabled in tests");
			});
		}
		for (const name of [
			"configure",
			"deleteConfig",
			"reload",
			"bulkGenerateConfigs",
			"bulkDeleteConfigs",
			"generateLetsEncryptRequestConfig",
			"deleteLetsEncryptRequestConfig",
		]) {
			mock.method(nginx, name, async () => {
				mutations++;
				return {};
			});
		}
		await mkdir("/data/access", { recursive: true });
		const app = (await import("../app.js")).default;
		const server = app.listen(0, "127.0.0.1");
		await once(server, "listening");
		const base = `http://127.0.0.1:${server.address().port}`;
		const call = async (method, path, token, body) => {
			const response = await fetch(base + path, {
				method,
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			const text = await response.text();
			return {
				status: response.status,
				retryAfter: response.headers.get("retry-after"),
				requestId: response.headers.get("x-request-id"),
				text,
				body: text ? JSON.parse(text) : null,
			};
		};
		const expectStatus = (result, status) => assert.equal(result.status, status, result.text);
		const users = [];
		const paths = Object.fromEntries(
			resources.map((resource) => [resource, `/nginx/${resource.replaceAll("_", "-")}`]),
		);
		const models = {};
		const own = {};
		const foreign = {};
		try {
			for (const [name, visibility, level, roles] of [
				["owner", "user", "manage", []],
				["other", "all", "manage", []],
				["admin", "all", "manage", ["admin"]],
				["viewer", "user", "view", []],
			]) {
				const user = await User.query().insertAndFetch({
					email: `${name}@example.test`,
					name,
					nickname: name,
					avatar: "",
					roles,
				});
				user.password = randomBytes(20).toString("hex");
				await Auth.query().insert({ user_id: user.id, type: "password", secret: user.password, meta: {} });
				await Permission.query().insert({
					user_id: user.id,
					visibility,
					...Object.fromEntries(resources.map((resource) => [resource, level])),
				});
				const login = await call("POST", "/tokens", null, { identity: user.email, secret: user.password });
				expectStatus(login, 200);
				user.jwt = login.body.token;
				users.push(user);
			}
			const [owner, other, admin, viewer] = users;
			const payloadFor = (resource, suffix) => {
				const example = structuredClone(
					schema.paths[paths[resource]].post.requestBody.content["application/json"].example || {},
				);
				if (resource === "certificates")
					return { provider: "other", nice_name: `fixture-${suffix}`, domain_names: [], meta: {} };
				if (resource === "access_lists")
					return { name: `fixture-${suffix}`, satisfy_any: false, pass_auth: false, items: [], clients: [] };
				if (resource === "streams") return { ...example, incoming_port: suffix === "own" ? 19001 : 19002 };
				return {
					...example,
					domain_names: [`${resource.replaceAll("_", "-")}-${suffix}.example.test`],
					certificate_id: 0,
					meta: {},
					advanced_config: "",
					...(resource === "proxy_hosts" ? { access_list_id: 0, locations: [] } : {}),
				};
			};
			for (const resource of resources) {
				const file = {
					proxy_hosts: "proxy_host",
					redirection_hosts: "redirection_host",
					dead_hosts: "dead_host",
					streams: "stream",
					access_lists: "access_list",
					certificates: "certificate",
				}[resource];
				models[resource] = (await import(`../models/${file}.js`)).default;
				for (const [user, map, label] of [
					[owner, own, "own"],
					[other, foreign, "foreign"],
				]) {
					const payload = payloadFor(resource, label);
					if (resource === "access_lists") {
						delete payload.items;
						delete payload.clients;
					}
					map[resource] = await models[resource]
						.query()
						.insertAndFetch({ ...payload, owner_user_id: user.id });
				}
			}
			const create = async (user, scopes, overrides = {}) =>
				call("POST", "/api-tokens", user.jwt, {
					name: "synthetic test token",
					scopes,
					password: user.password,
					...overrides,
				});
			const mint = async (user, scopes, overrides = {}) => {
				const result = await create(user, scopes, overrides);
				expectStatus(result, 201);
				return result.body;
			};
			const all = await mint(
				owner,
				resources.map((resource) => `${resource}:write`),
			);
			const read = await mint(
				owner,
				resources.map((resource) => `${resource}:read`),
			);
			const otherAll = await mint(
				other,
				resources.map((resource) => `${resource}:write`),
			);

			await t.test("JWT host grants do not widen owner-only PAT visibility", async () => {
				for (const key of ["proxy_host_ids", "proxyHostIds"]) {
					await Permission.query()
						.where("user_id", owner.id)
						.patch({
							meta: { [key]: [foreign.proxy_hosts.id] },
						});
					try {
						const sessionList = await call("GET", paths.proxy_hosts, owner.jwt);
						expectStatus(sessionList, 200);
						assert.ok(sessionList.body.some((host) => host.id === foreign.proxy_hosts.id));
						const tokenList = await call("GET", paths.proxy_hosts, read.token);
						expectStatus(tokenList, 200);
						assert.ok(tokenList.body.some((host) => host.id === own.proxy_hosts.id));
						assert.ok(tokenList.body.every((host) => host.owner_user_id === owner.id));
						expectStatus(
							await call("GET", `${paths.proxy_hosts}/${foreign.proxy_hosts.id}`, read.token),
							403,
						);
					} finally {
						await Permission.query().where("user_id", owner.id).patch({ meta: {} });
					}
				}
			});

			await t.test("JWT load validates current account state and initializes roles", async () => {
				const Access = (await import("../lib/access.js")).default;
				const access = new Access(admin.jwt);
				assert.equal((await access.load()).attrs.id, admin.id);
				assert.equal(access.hasRole("admin"), true);
				assert.equal(access.getPermissions().visibility, "all");
				await User.query().findById(viewer.id).patch({ is_disabled: 1 });
				try {
					await assert.rejects(new Access(viewer.jwt).load(), /User cannot be loaded/);
				} finally {
					await User.query().findById(viewer.id).patch({ is_disabled: 0 });
				}
			});

			await t.test(
				"creation requires JWT session, password step-up, valid scope and bounded expiry",
				async () => {
					for (const [overrides, status] of [
						[{ password: "wrong" }, 403],
						[{ name: "   " }, 400],
						[{ scopes: ["users:write"] }, 400],
						[{ expires_in_days: 0 }, 400],
						[{ expires_in_days: 366 }, 400],
					]) {
						const before = await ApiToken.query().resultSize();
						expectStatus(await create(owner, ["proxy_hosts:read"], overrides), status);
						assert.equal(await ApiToken.query().resultSize(), before);
					}
					expectStatus(await create(viewer, ["proxy_hosts:write"]), 403);
					expectStatus(
						await call("POST", "/api-tokens", null, {
							name: "x",
							scopes: ["proxy_hosts:read"],
							password: owner.password,
						}),
						403,
					);
				},
			);
			await t.test("secret shown once; hash only stored; lists and audit contain no secret", async () => {
				const row = await ApiToken.query().findById(all.id);
				const match = tokenPattern.exec(all.token);
				assert.ok(match);
				assert.equal(row.secret_hash, hashSecret(match[2]));
				assert.ok(!JSON.stringify(row).includes(all.token));
				assert.ok(!JSON.stringify(row).includes(match[2]));
				for (const path of ["/api-tokens", "/api-tokens/options"]) {
					const result = await call("GET", path, owner.jwt);
					expectStatus(result, 200);
					for (const secret of [all.token, match[2], row.secret_hash, row.password_version])
						assert.ok(!result.text.includes(secret));
				}
				const audit = JSON.stringify(await Audit.query());
				for (const secret of [all.token, match[2], row.secret_hash, owner.password])
					assert.ok(!audit.includes(secret));
			});
			await t.test(
				"owner intersection, read-only protection and all visibility across six families",
				async () => {
					for (const resource of resources) {
						const path = paths[resource];
						const result = await call("GET", path, read.token);
						expectStatus(result, 200);
						assert.ok(result.body.some((row) => row.id === own[resource].id));
						assert.ok(!result.body.some((row) => row.id === foreign[resource].id));
						expectStatus(await call("GET", `${path}/${own[resource].id}`, read.token), 200);
						expectStatus(await call("GET", `${path}/${foreign[resource].id}`, read.token), 403);
						expectStatus(await call("GET", `${path}/${foreign[resource].id}`, otherAll.token), 200);
						const before = mutations;
						expectStatus(await call("DELETE", `${path}/${own[resource].id}`, read.token), 403);
						expectStatus(await call("POST", path, read.token, payloadFor(resource, "blocked")), 403);
						assert.equal(mutations, before);
					}
				},
			);
			await t.test("scopes do not expand after owner permission changes", async () => {
				await Permission.query().where("user_id", owner.id).patch({ proxy_hosts: "hidden" });
				expectStatus(await call("GET", paths.proxy_hosts, all.token), 403);
				await Permission.query().where("user_id", owner.id).patch({ proxy_hosts: "manage", visibility: "all" });
				expectStatus(await call("GET", `${paths.proxy_hosts}/${foreign.proxy_hosts.id}`, all.token), 403);
				await Permission.query().where("user_id", owner.id).patch({ visibility: "user" });
				await Permission.query().where("user_id", other.id).patch({ visibility: "user" });
				expectStatus(await call("GET", `${paths.proxy_hosts}/${own.proxy_hosts.id}`, otherAll.token), 403);
				await Permission.query().where("user_id", other.id).patch({ visibility: "all" });
			});
			await t.test(
				"PAT default-denies minting, impersonation, management, security and future routes",
				async () => {
					for (const [method, path, body] of [
						["GET", "/tokens"],
						["POST", "/tokens", { identity: owner.email, secret: owner.password }],
						["GET", "/api-tokens"],
						["GET", "/api-tokens/options"],
						["POST", "/api-tokens", { name: "x", password: owner.password, scopes: ["proxy_hosts:read"] }],
						["DELETE", `/api-tokens/${all.id}`],
						["GET", "/users"],
						["POST", `/users/${other.id}/login`],
						["PUT", `/users/${owner.id}/auth`, { secret: "x" }],
						["GET", "/settings"],
						["GET", "/audit-log"],
						["GET", "/schema"],
						["GET", "/nginx/proxy-hosts/future"],
						["GET", `/nginx/certificates/${own.certificates.id}/download`],
						["PATCH", `/nginx/proxy-hosts/${own.proxy_hosts.id}`, {}],
					])
						expectStatus(await call(method, path, all.token, body), 403);
					assert.equal((await ApiToken.query().findById(all.id)).revoked_on, null);
				},
			);
			await t.test("expand and nested unauthorized relation IDs fail before mutation", async () => {
				for (const resource of resources)
					expectStatus(await call("GET", `${paths[resource]}?expand=owner`, all.token), 403);
				const before = mutations;
				const original = await models.proxy_hosts.query().findById(own.proxy_hosts.id);
				for (const body of [
					{ certificate_id: foreign.certificates.id },
					{ access_list_id: foreign.access_lists.id },
					{ locations: [{ path: "/", access_list_id: foreign.access_lists.id }] },
					{ owner_user_id: other.id },
				])
					expectStatus(await call("PUT", `${paths.proxy_hosts}/${own.proxy_hosts.id}`, all.token, body), 403);
				assert.equal(mutations, before);
				assert.deepEqual(await models.proxy_hosts.query().findById(own.proxy_hosts.id), original);
			});
			await t.test("ACL/certificate mutations cannot indirectly alter foreign hosts", async () => {
				await models.proxy_hosts
					.query()
					.findById(foreign.proxy_hosts.id)
					.patch({ access_list_id: own.access_lists.id, certificate_id: own.certificates.id });
				const before = mutations;
				expectStatus(
					await call("PUT", `${paths.access_lists}/${own.access_lists.id}`, all.token, { name: "blocked" }),
					403,
				);
				expectStatus(await call("DELETE", `${paths.certificates}/${own.certificates.id}`, all.token), 403);
				assert.equal(mutations, before);
				assert.equal((await models.access_lists.query().findById(own.access_lists.id)).name, "fixture-own");
				await models.proxy_hosts
					.query()
					.findById(foreign.proxy_hosts.id)
					.patch({ access_list_id: 0, certificate_id: 0 });
			});
			await t.test("certificate issuance side effects use case-insensitive and existing domains", async () => {
				const original = own.proxy_hosts.domain_names;
				const foreignDomains = foreign.proxy_hosts.domain_names;
				await models.proxy_hosts
					.query()
					.findById(own.proxy_hosts.id)
					.patch({ domain_names: ["shared.example.test"] });
				await models.proxy_hosts
					.query()
					.findById(foreign.proxy_hosts.id)
					.patch({ domain_names: ["SHARED.EXAMPLE.TEST"] });
				const before = mutations;
				const certificatesBefore = await models.certificates.query().resultSize();
				expectStatus(
					await call("POST", paths.certificates, all.token, {
						provider: "letsencrypt",
						domain_names: ["shared.example.test"],
						meta: {},
					}),
					403,
				);
				expectStatus(
					await call("PUT", `${paths.proxy_hosts}/${own.proxy_hosts.id}`, all.token, {
						certificate_id: "new",
					}),
					403,
				);
				assert.equal(mutations, before);
				assert.equal(await models.certificates.query().resultSize(), certificatesBefore);
				assert.equal(acmeCalls, 0);
				await models.proxy_hosts.query().findById(own.proxy_hosts.id).patch({ domain_names: original });
				await models.proxy_hosts
					.query()
					.findById(foreign.proxy_hosts.id)
					.patch({ domain_names: foreignDomains });
			});
			await t.test("custom configuration and directive injection cannot mutate Nginx via PAT", async () => {
				const before = mutations;
				for (const body of [
					{ advanced_config: "return 200;" },
					{ locations: [{ path: "/", advanced_config: "return 200;" }] },
					{ forward_host: "127.0.0.1; include /data/private;" },
					{ locations: [{ path: "/;return 200;" }] },
				])
					expectStatus(await call("PUT", `${paths.proxy_hosts}/${own.proxy_hosts.id}`, all.token, body), 403);
				await models.proxy_hosts
					.query()
					.findById(own.proxy_hosts.id)
					.patch({ advanced_config: "# existing custom config" });
				expectStatus(
					await call("PUT", `${paths.proxy_hosts}/${own.proxy_hosts.id}`, all.token, { forward_port: 8081 }),
					403,
				);
				expectStatus(await call("POST", `${paths.proxy_hosts}/${own.proxy_hosts.id}/disable`, all.token), 403);
				assert.equal(mutations, before);
				const result = await call("GET", `${paths.proxy_hosts}/${own.proxy_hosts.id}`, all.token);
				expectStatus(result, 200);
				assert.equal(result.body.advanced_config, "# existing custom config");
				await models.proxy_hosts.query().findById(own.proxy_hosts.id).patch({ advanced_config: "" });
			});
			await t.test(
				"validation, early parser failures and certificate writes never log secret canaries",
				async () => {
					const canary = "PRIVATE_PAT_TEST_CANARY";
					const oldDebug = process.env.DEBUG;
					process.env.DEBUG = "true";
					try {
						const raw = await fetch(base + paths.proxy_hosts, {
							method: "POST",
							headers: { Authorization: `Bearer ${all.token}`, "Content-Type": "application/json" },
							body: `{"password":"${canary}",`,
						});
						assert.equal(raw.status, 400);
						const rawText = await raw.text();
						assert.ok(!rawText.includes(canary));
						assert.ok(!rawText.includes('"debug"'));
						const result = await call("POST", paths.proxy_hosts, all.token, {
							domain_names: [],
							password: canary,
						});
						expectStatus(result, 400);
						assert.ok(!result.text.includes(canary));
						assert.ok(!result.text.includes('"debug"'));
						const certificate = (await import("../internal/certificate.js")).default;
						await mkdir("/data/custom_ssl", { recursive: true });
						await certificate.writeCustomCert({
							id: 777,
							provider: "other",
							meta: { certificate: "synthetic certificate", certificate_key: canary },
						});
						await new Promise((resolve) => setTimeout(resolve, 50));
						assert.ok(!(await readFile("/data/logs/backend.log", "utf8")).includes(canary));
					} finally {
						if (oldDebug === undefined) delete process.env.DEBUG;
						else process.env.DEBUG = oldDebug;
					}
				},
			);
			await t.test(
				"sensitive failures remain observable without logging messages, stacks or bodies",
				async () => {
					const hosts = (await import("../internal/proxy-host.js")).default;
					const tokens = (await import("../internal/api-token.js")).default;
					const oldDebug = process.env.DEBUG;
					process.env.DEBUG = "true";
					const canary = "SENSITIVE_FAILURE_CANARY";
					try {
						for (const [operations, method, path, credential] of [
							[hosts, "getAll", paths.proxy_hosts, all.token],
							[tokens, "getAll", "/api-tokens", owner.jwt],
						]) {
							for (const failure of [
								Object.assign(new TypeError(canary), { code: "EACCES" }),
								{ name: "Error", code: "SQLITE_BUSY", message: canary, body: canary },
							]) {
								const stub = mock.method(operations, method, async () => {
									throw failure;
								});
								let result;
								try {
									result = await call("GET", path, credential);
								} finally {
									stub.mock.restore();
								}
								expectStatus(result, 500);
								assert.ok(result.requestId);
								assert.ok(!result.text.includes(canary));
								assert.ok(!result.body.debug);
								await new Promise((resolve) => setTimeout(resolve, 30));
								const log = await readFile("/data/logs/backend.log", "utf8");
								assert.ok(!log.includes(canary));
								assert.ok(
									log
										.split("\n")
										.some(
											(line) =>
												line.includes("WARN") &&
												line.includes(result.requestId) &&
												line.includes(failure.code),
										),
								);
							}
						}
						// The management boundary must also precede the JSON parser.
						const raw = await fetch(`${base}/api-tokens`, {
							method: "POST",
							headers: { Authorization: `Bearer ${owner.jwt}`, "Content-Type": "application/json" },
							body: `{"password":"${canary}",`,
						});
						assert.equal(raw.status, 400);
						assert.ok(!(await raw.text()).includes(canary));
						await new Promise((resolve) => setTimeout(resolve, 30));
						const log = await readFile("/data/logs/backend.log", "utf8");
						assert.ok(!log.includes(canary));
						assert.ok(log.includes("entity.parse.failed"));
					} finally {
						if (oldDebug === undefined) delete process.env.DEBUG;
						else process.env.DEBUG = oldDebug;
					}
				},
			);
			await t.test("PAT resource audit preserves actor, resource and typed changes", async () => {
				const Access = (await import("../lib/access.js")).default;
				const audit = (await import("../internal/audit-log.js")).default;
				const access = new Access(all.token);
				await access.load();
				const row = await audit.add(access, {
					action: "updated",
					object_type: "proxy-host",
					object_id: own.proxy_hosts.id,
					meta: {
						forward_port: 8081,
						enabled: false,
						advanced_config: "AUDIT_SECRET",
						meta: { certificate_key: "AUDIT_SECRET" },
					},
				});
				assert.equal(row.user_id, owner.id);
				assert.equal(row.object_id, own.proxy_hosts.id);
				assert.equal(row.object_type, "proxy-host");
				assert.deepEqual(row.meta, {
					api_token_id: all.id,
					fields: ["advanced_config", "enabled", "forward_port", "meta"],
					forward_port: 8081,
					enabled: false,
				});
				assert.ok(!JSON.stringify(row).includes("AUDIT_SECRET"));
			});
			for (const resource of resources) {
				await t.test(
					`${resource} scope: real create/read/${resource === "certificates" ? "delete (PUT forbidden)" : "update/delete"}`,
					async () => {
						const scoped = await mint(owner, [`${resource}:write`]);
						const otherResource = resources.find((item) => item !== resource);
						expectStatus(await call("GET", paths[otherResource], scoped.token), 403);
						const created = await call(
							"POST",
							paths[resource],
							scoped.token,
							payloadFor(resource, `crud-${resource}`),
						);
						expectStatus(created, 201);
						const id = created.body.id;
						assert.equal((await models[resource].query().findById(id)).owner_user_id, owner.id);
						assert.ok(!("owner" in created.body));
						expectStatus(await call("GET", `${paths[resource]}/${id}`, scoped.token), 200);
						if (resource !== "certificates") {
							const update =
								resource === "access_lists"
									? { name: "updated" }
									: resource === "streams"
										? { forwarding_port: 8081 }
										: resource === "proxy_hosts"
											? { forward_port: 8081 }
											: resource === "redirection_hosts"
												? { forward_domain_name: "updated.example.test" }
												: { domain_names: ["updated-dead.example.test"] };
							expectStatus(await call("PUT", `${paths[resource]}/${id}`, scoped.token, update), 200);
						} else
							expectStatus(
								await call("PUT", `${paths[resource]}/${id}`, scoped.token, { nice_name: "blocked" }),
								403,
							);
						expectStatus(await call("DELETE", `${paths[resource]}/${id}`, scoped.token), 200);
						assert.equal((await models[resource].query().findById(id)).is_deleted, true);
					},
				);
			}
			await t.test("certificate upload uses real OpenSSL and never returns or logs private key", async () => {
				execFileSync(
					"openssl",
					[
						"req",
						"-x509",
						"-newkey",
						"rsa:2048",
						"-nodes",
						"-subj",
						"/CN=upload.example.test",
						"-keyout",
						resolve("/data/key.pem"),
						"-out",
						resolve("/data/cert.pem"),
						"-days",
						"1",
					],
					{ stdio: "ignore" },
				);
				const certToken = await mint(owner, ["certificates:write"]);
				const key = await readFile("/data/key.pem", "utf8");
				const certificate = await readFile("/data/cert.pem", "utf8");
				const form = new FormData();
				form.append("certificate", new Blob([certificate]), "certificate.pem");
				form.append("certificate_key", new Blob([key]), "key.pem");
				const response = await fetch(`${base}${paths.certificates}/${own.certificates.id}/upload`, {
					method: "POST",
					headers: { Authorization: `Bearer ${certToken.token}` },
					body: form,
				});
				const text = await response.text();
				assert.equal(response.status, 200, text);
				assert.ok(!text.includes("certificate_key"));
				assert.ok(!text.includes(key));
				await new Promise((resolve) => setTimeout(resolve, 50));
				const log = await readFile("/data/logs/backend.log", "utf8");
				assert.ok(!log.includes(key));
				assert.ok(
					log
						.split("\n")
						.some((line) => line.includes("[SSL") && line.includes(response.headers.get("x-request-id"))),
				);
				assert.equal(await readFile(`/data/custom_ssl/npm-${own.certificates.id}/privkey.pem`, "utf8"), key);
			});
			for (const enableDuringVerification of [false, true]) {
				await t.test(
					`in-flight creation cannot escape disable (early re-enable: ${enableDuringVerification})`,
					async () => {
						const entered = Promise.withResolvers();
						const release = Promise.withResolvers();
						const verifyPassword = Auth.prototype.verifyPassword;
						const verification = mock.method(Auth.prototype, "verifyPassword", async function (password) {
							const valid = await verifyPassword.call(this, password);
							if (this.user_id === viewer.id) {
								entered.resolve();
								await release.promise;
							}
							return valid;
						});
						const pending = create(viewer, ["proxy_hosts:read"]);
						try {
							await entered.promise;
							expectStatus(
								await call("PUT", `/users/${viewer.id}`, admin.jwt, { is_disabled: true }),
								200,
							);
							if (enableDuringVerification)
								expectStatus(
									await call("PUT", `/users/${viewer.id}`, admin.jwt, { is_disabled: false }),
									200,
								);
						} finally {
							release.resolve();
						}
						const created = await pending;
						verification.mock.restore();
						if (!enableDuringVerification)
							expectStatus(
								await call("PUT", `/users/${viewer.id}`, admin.jwt, { is_disabled: false }),
								200,
							);
						expectStatus(created, 201);
						expectStatus(await call("GET", paths.proxy_hosts, created.body.token), 401);
						const fresh = await mint(viewer, ["proxy_hosts:read"]);
						expectStatus(await call("GET", paths.proxy_hosts, fresh.token), 200);
					},
				);
			}
			await t.test("user disable via JWT permanently revokes PATs across re-enable", async () => {
				const token = await mint(viewer, ["proxy_hosts:read"]);
				expectStatus(await call("PUT", `/users/${viewer.id}`, admin.jwt, { is_disabled: true }), 200);
				assert.ok((await ApiToken.query().findById(token.id)).revoked_on);
				expectStatus(await call("PUT", `/users/${viewer.id}`, admin.jwt, { is_disabled: false }), 200);
				expectStatus(await call("GET", paths.proxy_hosts, token.token), 401);
			});
			await t.test("API password reset invalidates creation already verifying the old password", async () => {
				const entered = Promise.withResolvers();
				const release = Promise.withResolvers();
				const verifyPassword = Auth.prototype.verifyPassword;
				const verification = mock.method(Auth.prototype, "verifyPassword", async function (password) {
					const valid = await verifyPassword.call(this, password);
					if (this.user_id === viewer.id) {
						entered.resolve();
						await release.promise;
					}
					return valid;
				});
				const pending = create(viewer, ["proxy_hosts:read"]);
				const password = randomBytes(20).toString("hex");
				try {
					await entered.promise;
					expectStatus(
						await call("PUT", `/users/${viewer.id}/auth`, admin.jwt, {
							type: "password",
							secret: password,
						}),
						200,
					);
				} finally {
					release.resolve();
				}
				const created = await pending;
				verification.mock.restore();
				expectStatus(created, 201);
				expectStatus(await call("GET", paths.proxy_hosts, created.body.token), 401);
				const login = await call("POST", "/tokens", null, { identity: viewer.email, secret: password });
				expectStatus(login, 200);
				const fresh = await mint({ ...viewer, jwt: login.body.token, password }, ["proxy_hosts:read"]);
				expectStatus(await call("GET", paths.proxy_hosts, fresh.token), 200);
			});
			await t.test(
				"revocation, expiry, bad secrets, disable/delete and password change fail closed",
				async () => {
					const revoked = await mint(owner, ["proxy_hosts:read"]);
					expectStatus(await call("DELETE", `/api-tokens/${revoked.id}`, other.jwt), 404);
					expectStatus(await call("DELETE", `/api-tokens/${revoked.id}`, owner.jwt), 200);
					expectStatus(await call("GET", paths.proxy_hosts, revoked.token), 401);
					const expired = await mint(owner, ["proxy_hosts:read"]);
					await ApiToken.query()
						.findById(expired.id)
						.patch({ expires_on: new Date(Date.now() - 1000).toISOString() });
					expectStatus(await call("GET", paths.proxy_hosts, expired.token), 401);
					expectStatus(await call("GET", paths.proxy_hosts, `${all.token.slice(0, -1)}!`), 401);
					expectStatus(
						await call(
							"GET",
							paths.proxy_hosts,
							`${all.token.slice(0, -1)}${all.token.endsWith("A") ? "B" : "A"}`,
						),
						401,
					);
					for (const field of ["is_disabled", "is_deleted"]) {
						await User.query()
							.findById(owner.id)
							.patch({ [field]: true });
						expectStatus(await call("GET", paths.proxy_hosts, all.token), 401);
						await User.query()
							.findById(owner.id)
							.patch({ [field]: false });
					}
					const password = randomBytes(20).toString("hex");
					expectStatus(
						await call("PUT", `/users/${owner.id}/auth`, owner.jwt, {
							type: "password",
							current: owner.password,
							secret: password,
						}),
						200,
					);
					expectStatus(await call("GET", paths.proxy_hosts, all.token), 401);
					const login = await call("POST", "/tokens", null, { identity: owner.email, secret: password });
					expectStatus(login, 200);
					const fresh = await mint({ ...owner, jwt: login.body.token, password }, ["proxy_hosts:read"]);
					expectStatus(await call("GET", paths.proxy_hosts, fresh.token), 200);
				},
			);
			await t.test("real 2FA step-up cannot be skipped; valid TOTP permits creation", async () => {
				const { generateSecret, generate } = await import("otplib");
				const secret = generateSecret();
				const auth = await Auth.query().findOne({ user_id: admin.id, type: "password" });
				await Auth.query()
					.findById(auth.id)
					.patch({ meta: { totp_enabled: true, totp_secret: secret, backup_codes: [] } });
				expectStatus(await create(admin, ["proxy_hosts:read"]), 403);
				expectStatus(await create(admin, ["proxy_hosts:read"], { code: "invalid!" }), 403);
				const token = await mint(admin, ["proxy_hosts:read"], { code: await generate({ secret }) });
				expectStatus(await call("GET", paths.proxy_hosts, token.token), 200);
			});
			await t.test("JWT regression: existing raw list and session management remain available", async () => {
				expectStatus(await call("GET", "/tokens", other.jwt), 200);
				expectStatus(await call("GET", "/api-tokens/options", other.jwt), 200);
				const result = await call("GET", `${paths.proxy_hosts}?expand=owner`, other.jwt);
				expectStatus(result, 200);
				assert.ok(result.body.some((row) => row.owner));
			});
			await t.test(
				"JWT expanded owners hide credential state and preserve the proxy-host response schema",
				async () => {
					const Ajv = (await import("ajv/dist/2020.js")).default;
					const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
					assert.ok(Number.isInteger((await User.query().findById(other.id)).api_token_version));
					for (const resource of resources) {
						const result = await call("GET", `${paths[resource]}?expand=owner`, other.jwt);
						expectStatus(result, 200);
						assert.ok(result.body.some((row) => row.owner));
						assert.ok(!result.text.includes('"api_token_version"'));
						if (resource === "proxy_hosts") {
							const validate = ajv.compile(
								schema.paths[paths[resource]].get.responses[200].content["application/json"].schema,
							);
							assert.ok(validate(result.body), JSON.stringify(validate.errors));
						}
					}
				},
			);
			await t.test("PAT creation step-up limits failed password attempts before checking valid credentials", async () => {
				const user = await User.query().insertAndFetch({
					email: "limited@example.test",
					name: "limited",
					nickname: "limited",
					avatar: "",
					roles: [],
				});
				user.password = randomBytes(20).toString("hex");
				await Auth.query().insert({ user_id: user.id, type: "password", secret: user.password, meta: {} });
				await Permission.query().insert({
					user_id: user.id,
					visibility: "user",
					...Object.fromEntries(resources.map((resource) => [resource, "view"])),
				});
				const login = await call("POST", "/tokens", null, { identity: user.email, secret: user.password });
				assert.equal(login.status, 200, "fixture login must succeed");
				user.jwt = login.body.token;
				const before = await ApiToken.query().where("owner_user_id", user.id).resultSize();
				for (let attempt = 0; attempt < 5; attempt++) {
					const failed = await create(user, ["proxy_hosts:read"], { password: "wrong" });
					assert.equal(failed.status, 403, "failed step-up must be rejected");
				}
				const limited = await create(user, ["proxy_hosts:read"]);
				assert.equal(limited.status, 429, "valid credentials must not bypass an active limit");
				assert.ok(Number(limited.retryAfter) > 0 && Number(limited.retryAfter) <= 900);
				assert.equal(await ApiToken.query().where("owner_user_id", user.id).resultSize(), before);
			});
			await t.test("SQLite PAT migration rolls down and recreates cleanly", async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				const migration = await import("../migrations/20261014171500_api_tokens.js");
				const versionMigration = await import("../migrations/20261028180000_api_token_version.js");
				assert.equal(await db().schema.hasTable("api_token"), true);
				await versionMigration.down(db());
				assert.equal(await db().schema.hasColumn("user", "api_token_version"), false);
				await migration.down(db());
				assert.equal(await db().schema.hasTable("api_token"), false);
				await migration.up(db());
				await versionMigration.up(db());
				assert.equal(await db().schema.hasColumn("api_token", "owner_version"), true);
				assert.equal((await User.query().findById(owner.id)).api_token_version, 0);
				assert.equal(await db().schema.hasTable("api_token"), true);
				assert.equal(await ApiToken.query().resultSize(), 0);
			});
		} finally {
			await new Promise((resolve) => server.close(resolve));
			await new Promise((resolve) => setTimeout(resolve, 100));
			mock.restoreAll();
			await db().destroy();
		}
	});
}
