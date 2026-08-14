#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.NPM_DEV_API_URL || "http://127.0.0.1:3081/api";
const container = process.env.NPM_DEV_CONTAINER || "npm2dev.core";
const stamp = Date.now();
const email = `semantic-e2e-${stamp}@example.invalid`;
const password = `SemanticE2E-${crypto.randomUUID().replaceAll("-", "")}`;
const domain = `semantic-e2e-${stamp}.localhost`;
let userId = null;
let hostId = null;
let token = null;
const cleanupErrors = [];

const catalog = JSON.parse(readFileSync(join(here, "../backend/config/proxy-directive-catalog.json"), "utf8"));
const clone = (value) => structuredClone(value);
const assertMatch = (value, pattern, message) => assert.match(String(value), pattern, message);

const docker = (args, options = {}) => {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`docker ${args.join(" ")} failed (${result.status}):\n${detail}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
};

const runContainerNode = (source, env = {}) => {
  const args = ["exec", "-i"];
  for (const [key, value] of Object.entries(env)) args.push("-e", `${key}=${value}`);
  args.push(container, "node", "--input-type=module", "-");
  return docker(args, { input: source }).replace(/\u001b\[[0-9;]*m/g, "").trim();
};

const request = async (method, path, body) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (typeof body !== "undefined") headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  }
  return { status: response.status, body: parsed, raw };
};

const buildExplicitServer = () => {
  const directives = { default_location_enabled: true };
  const headers = {};
  for (const entry of catalog.directives) {
    const target = entry.storage.section === "headers" ? headers : directives;
    target[entry.storage.key] = clone(entry.profileValue);
  }
  directives.proxy_pass_trailers = false;
  directives.proxy_redirect = "off";
  headers.hide_response = ["Server"];
  return { directives, headers };
};

const createUserSource = `
import Database from "better-sqlite3";
import bcrypt from "bcrypt";
const db = new Database("/data/database.sqlite");
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const now = new Date().toISOString().replace("T", " ").replace("Z", "");
const hash = await bcrypt.hash(password, 13);
const tx = db.transaction(() => {
  const stale = db.prepare("select id from user where email = ?").all(email);
  for (const row of stale) {
    db.prepare("delete from auth where user_id = ?").run(row.id);
    db.prepare("delete from user_permission where user_id = ?").run(row.id);
    db.prepare("delete from user where id = ?").run(row.id);
  }
  const result = db.prepare("insert into user (created_on, modified_on, is_deleted, is_disabled, email, name, nickname, avatar, roles) values (?, ?, 0, 0, ?, ?, ?, ?, ?)")
    .run(now, now, email, "Semantic E2E", "Semantic E2E", "", JSON.stringify(["admin"]));
  const userId = Number(result.lastInsertRowid);
  db.prepare("insert into auth (created_on, modified_on, user_id, type, secret, meta, is_deleted) values (?, ?, ?, 'password', ?, ?, 0)")
    .run(now, now, userId, hash, JSON.stringify({}));
  db.prepare("insert into user_permission (created_on, modified_on, user_id, visibility, proxy_hosts, redirection_hosts, dead_hosts, streams, access_lists, certificates, upstreams) values (?, ?, ?, 'all', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage')")
    .run(now, now, userId);
  return userId;
});
console.log(tx());
db.close();
`;

const cleanupHostSource = `
import Database from "better-sqlite3";
const db = new Database("/data/database.sqlite");
const hostId = Number(process.env.TEST_HOST_ID || 0);
const userId = Number(process.env.TEST_USER_ID || 0);
const domainNames = JSON.stringify([process.env.TEST_DOMAIN]);
const host = db.prepare("select id from proxy_host where id = ? and owner_user_id = ? and domain_names = ? and is_deleted = 1").get(hostId, userId, domainNames);
if (host) {
  const tx = db.transaction(() => {
    for (const table of ["proxy_host_monitor_event", "proxy_host_metric_minute", "proxy_host_metric_hour", "proxy_host_monitor_state", "proxy_host_monitor_config", "proxy_host_upstream"]) {
      db.prepare("delete from " + table + " where proxy_host_id = ?").run(hostId);
    }
    db.prepare("delete from nginx_deployment where host_type = 'proxy_host' and host_id = ? and owner_user_id = ?").run(hostId, userId);
    db.prepare("delete from audit_log where object_type = 'proxy-host' and object_id = ? and user_id = ?").run(hostId, userId);
    db.prepare("delete from proxy_host where id = ? and owner_user_id = ? and domain_names = ? and is_deleted = 1").run(hostId, userId, domainNames);
  });
  tx();
}
console.log(host ? 1 : 0);
db.close();
`;

const cleanupUserSource = `
import Database from "better-sqlite3";
const db = new Database("/data/database.sqlite");
const email = process.env.TEST_EMAIL;
const requestedId = Number(process.env.TEST_USER_ID || 0);
const rows = requestedId
  ? db.prepare("select id from user where id = ? and email = ?").all(requestedId, email)
  : db.prepare("select id from user where email = ?").all(email);
const tx = db.transaction(() => {
  for (const row of rows) {
    db.prepare("delete from auth where user_id = ?").run(row.id);
    db.prepare("delete from user_permission where user_id = ?").run(row.id);
    db.prepare("delete from user where id = ? and email = ?").run(row.id, email);
  }
});
tx();
console.log(rows.length);
db.close();
`;

try {
  const health = execFileSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", container], { encoding: "utf8" }).trim();
  assert.equal(health, "healthy", `${container} must be healthy`);

  console.log("[1/10] Creating isolated temporary admin...");
  userId = Number(runContainerNode(createUserSource, { TEST_EMAIL: email, TEST_PASSWORD: password }).split(/\r?\n/).at(-1));
  assert.ok(Number.isInteger(userId) && userId > 0, "temporary admin id was not returned");

  console.log("[2/10] Authenticating through POST /tokens...");
  const tokenResponse = await request("POST", "/tokens", { identity: email, secret: password });
  assert.equal(tokenResponse.status, 200, `token endpoint: ${tokenResponse.raw}`);
  assert.ok(tokenResponse.body?.token, "token response did not contain a token");
  token = tokenResponse.body.token;

  const payload = {
    domain_names: [domain],
    forward_scheme: "http",
    forward_host: "127.0.0.1",
    forward_port: 65534,
    default_target: { type: "direct", scheme: "http", host: "127.0.0.1", port: 65534 },
    access_list_id: 0,
    certificate_id: 0,
    ssl_forced: false,
    caching_enabled: false,
    block_exploits: false,
    allow_websocket_upgrade: false,
    http2_support: false,
    hsts_enabled: false,
    hsts_subdomains: false,
    trust_forwarded_proto: false,
    advanced_config: "",
    enabled: true,
    meta: {},
    nginx_config: {
      schema_version: 2,
      profile_version: catalog.profileVersion,
      listener: { mode: "domain" },
      server: buildExplicitServer(),
    },
    locations: [{
      location_id: "semantic-api",
      path: "/api/",
      forward_scheme: "http",
      forward_host: "127.0.0.1",
      forward_port: 65533,
      target: { type: "direct", scheme: "http", host: "127.0.0.1", port: 65533 },
      match_type: "priority_prefix",
      path_mode: "preserve_uri",
      forward_path: "",
      advanced_config: "",
      nginx_config: {
        mode: "inherit",
        overrides: {
          directives: { proxy_read_timeout: "5s", proxy_pass_trailers: false },
          headers: { hide_response: [] },
        },
      },
    }],
  };

  console.log("[3/10] Rejecting unknown semantic fields at the API boundary...");
  const unknownPayload = clone(payload);
  unknownPayload.nginx_config.server.directives.invisible_default = true;
  const unknownResponse = await request("POST", "/nginx/proxy-hosts/nginx-config/preview", unknownPayload);
  assert.equal(unknownResponse.status, 400, `unknown field response: ${unknownResponse.raw}`);

  console.log("[4/10] Rejecting proxy_redirect default with variable managed proxy_pass...");
  const invalidPayload = clone(payload);
  invalidPayload.nginx_config.server.directives.proxy_redirect = "default";
  const invalidResponse = await request("POST", "/nginx/proxy-hosts/nginx-config/preview", invalidPayload);
  assert.equal(invalidResponse.status, 422, `proxy_redirect response: ${invalidResponse.raw}`);
  assertMatch(invalidResponse.raw, /PROXY_REDIRECT_DEFAULT_WITH_VARIABLE_PROXY_PASS/, "expected diagnostic code missing");

  console.log("[5/10] Previewing a complete schema v2 configuration...");
  const previewResponse = await request("POST", "/nginx/proxy-hosts/nginx-config/preview", payload);
  assert.equal(previewResponse.status, 200, `preview response: ${previewResponse.raw}`);
  const preview = previewResponse.body;
  assert.equal(preview.valid, true, `preview invalid: ${previewResponse.raw}`);
  assert.equal(preview.validation_scope, "partial");
  assert.ok(preview.diagnostics.some((item) => item.code === "PREVIEW_NEW_HOST"), "new-host partial preview diagnostic missing");
  assert.equal(preview.capability.nginx_version, "1.29.2.5");
  assert.equal(preview.effective_config.schema_version, 2);
  assertMatch(preview.config, /proxy_pass_trailers off;/, "preview omitted explicit trailers off");
  assertMatch(preview.config, /location \^~ \/api\/ \{/, "preview omitted custom Location");
  assertMatch(preview.config, /proxy_read_timeout 5s;/, "preview omitted Location override");
  const effectiveLocation = preview.effective_config.locations.find((item) => item.path === "/api/");
  assert.ok(effectiveLocation, "effective config omitted /api/");
  assert.deepEqual(effectiveLocation.effective.headers.hide_response, [], "empty Location list did not clear inheritance");
  assert.equal(effectiveLocation.sources.hide_response_headers.source, "user", "empty-list source is not user");
  const locationTrailerMap = preview.source_map.filter((item) => item.path === "/api/" && item.field === "proxy_pass_trailers");
  assert.equal(locationTrailerMap.length, 1, "source map must contain one /api/ trailers record");

  console.log("[6/10] Creating and deploying the Proxy Host...");
  const createResponse = await request("POST", "/nginx/proxy-hosts", payload);
  assert.equal(createResponse.status, 201, `create response: ${createResponse.raw}`);
  hostId = Number(createResponse.body?.id);
  assert.ok(Number.isInteger(hostId) && hostId > 0, "create response omitted host id");
  assert.equal(createResponse.body.nginx_config.schema_version, 2);
  assert.equal(createResponse.body.nginx_config.server.directives.proxy_pass_trailers, false);

  console.log("[7/10] Re-previewing the persisted host with full mirror validation...");
  const persistedPreviewPayload = { ...clone(payload), host_id: hostId, base_revision: createResponse.body.nginx_config_revision };
  const persistedPreviewResponse = await request("POST", "/nginx/proxy-hosts/nginx-config/preview", persistedPreviewPayload);
  assert.equal(persistedPreviewResponse.status, 200, `persisted preview response: ${persistedPreviewResponse.raw}`);
  assert.equal(persistedPreviewResponse.body.valid, true, `persisted preview invalid: ${persistedPreviewResponse.raw}`);
  assert.equal(persistedPreviewResponse.body.validation_scope, "full");
  assert.ok(persistedPreviewResponse.body.preview_token, "full persisted preview did not issue a preview token");
  assert.notEqual(persistedPreviewResponse.body.hash, preview.hash, "new-host partial preview should use a different unresolved artifact identity");

  console.log("[8/10] Reading desired/applied/deployed artifacts...");
  const artifactResponse = await request("GET", `/nginx/proxy-hosts/${hostId}/nginx-config?include_content=deployed,candidate`);
  assert.equal(artifactResponse.status, 200, `artifact response: ${artifactResponse.raw}`);
  const artifact = artifactResponse.body;
  assert.equal(artifact.status, "online", `deployment status is ${artifact.status}`);
  assert.equal(artifact.desired.schema_version, 2);
  assert.equal(artifact.applied_revision, artifact.desired_revision);
  assertMatch(artifact.deployed.config, /proxy_pass_trailers off;/, "deployed artifact omitted trailers off");
  assert.equal(artifact.candidate, null, "successful deployment should not retain a failed candidate artifact");
  assert.equal(artifact.deployed.hash, persistedPreviewResponse.body.hash, "persisted preview and deployed artifact hashes differ");
  assert.equal(artifact.applied_snapshot.effective_config.schema_version, 2);
  assert.ok(artifact.applied_snapshot.source_map.length > 0, "applied source map is empty");

  console.log("[9/10] Validating the active runtime with nginx -t...");
  const nginxTest = docker(["exec", container, "nginx", "-t"]);
  assertMatch(nginxTest, /test is successful/, "nginx -t did not report success");

  console.log("[10/10] Verifying the deployed file directly...");
  const deployedFile = docker(["exec", container, "sh", "-lc", `cat /data/nginx/proxy_host/${hostId}.conf`]);
  assertMatch(deployedFile, /proxy_pass_trailers off;/, "active file omitted trailers off");
  assertMatch(deployedFile, /proxy_read_timeout 5s;/, "active file omitted Location override");

  console.log(JSON.stringify({
    success: true,
    host_id: hostId,
    domain,
    directive_count: catalog.directives.length,
    source_map_records: preview.source_map.length,
    nginx_version: preview.capability.nginx_version,
    deployment_status: artifact.status,
  }, null, 2));
} finally {
  if (hostId && token) {
    try {
      const response = await request("DELETE", `/nginx/proxy-hosts/${hostId}`);
      if (![200, 204, 404].includes(response.status)) cleanupErrors.push(`host cleanup: ${response.status} ${response.raw}`);
    } catch (error) { cleanupErrors.push(`host cleanup: ${error.message}`); }
  }
  if (hostId && userId) {
    try {
      const purged = Number(runContainerNode(cleanupHostSource, {
        TEST_HOST_ID: String(hostId),
        TEST_USER_ID: String(userId),
        TEST_DOMAIN: domain,
      }).split(/\r?\n/).at(-1));
      if (purged !== 1) cleanupErrors.push("host database cleanup did not find the expected soft-deleted test row");
    } catch (error) { cleanupErrors.push(`host database cleanup: ${error.message}`); }
  }
  if (userId) {
    try {
      runContainerNode(cleanupUserSource, { TEST_EMAIL: email, TEST_USER_ID: String(userId) });
    } catch (error) { cleanupErrors.push(`user cleanup: ${error.message}`); }
  }
  for (const error of cleanupErrors) console.warn(`Cleanup warning: ${error}`);
}
