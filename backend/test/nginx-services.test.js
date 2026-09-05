import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-service-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [{ NginxLogFollowHub, MAX_STREAMS_PER_USER }, { createDeploymentStore }, { default: nginxDeploymentModel }] =
	await Promise.all([
		import("../internal/nginx-log-follow-hub.js"),
		import("../internal/nginx-deployment-store.js"),
		import("../models/nginx_deployment.js"),
	]);

test("deployment store persists creation, transitions and logical candidate paths", async () => {
	const operations = [];
	const originalQuery = nginxDeploymentModel.query;
	nginxDeploymentModel.query = () => ({
		insert: async (value) => operations.push({ type: "insert", value }),
		where(column, value) {
			return {
				patch: async (patch) => operations.push({ type: "patch", column, value, patch }),
			};
		},
	});

	try {
		const store = createDeploymentStore({
			nginxRoot: testRoot,
			ownerUserId: 9,
			parentOperationId: "parent",
		});
		await store.create({ operation_id: "op-1", state: "rendering" });
		await store.transition("op-1", "rendered", {
			payloadHash: "payload",
			dependencyHash: "dependency",
			templateVersion: "v1",
			templateHash: "template",
			capabilityHash: "capability",
			configHash: "config",
			diagnostics: { warnings: [] },
		});
		await store.transition("op-1", "failed", null, "nginx rejected config");
		await store.setCandidatePath("op-1", path.join(testRoot, "deployments", "op-1", "candidate.conf"));

		assert.equal(operations[0].type, "insert");
		assert.equal(operations[0].value.owner_user_id, 9);
		assert.equal(operations[0].value.parent_operation_id, "parent");
		assert.ok(operations[0].value.started_on);
		assert.deepEqual(operations[1].patch, {
			state: "rendered",
			payload_hash: "payload",
			dependency_hash: "dependency",
			template_version: "v1",
			template_hash: "template",
			capability_hash: "capability",
			config_hash: "config",
			diagnostics: { warnings: [] },
		});
		assert.equal(operations[2].patch.state, "failed");
		assert.deepEqual(operations[2].patch.journal_summary, { error: "nginx rejected config" });
		assert.ok(operations[2].patch.finished_on);
		assert.equal(operations[3].patch.candidate_path, "deployments/op-1/candidate.conf");
	} finally {
		nginxDeploymentModel.query = originalQuery;
	}
});

test("log follow hub creates and releases subscriptions", () => {
	const hub = new NginxLogFollowHub();
	const target = { scope: "proxy-host", id: 7, logKind: "access", fileName: "proxy-host-7_access.log" };
	const received = [];
	const subscription = hub.subscribe({
		target,
		userId: 9,
		cursor: null,
		onEvent: (...args) => received.push(args),
		canSend: () => true,
	});

	assert.equal(hub.getUserStreamCount(9), 1);
	assert.equal(hub.channels.size, 1);
	subscription.poll();
	subscription.unsubscribe();
	assert.equal(hub.getUserStreamCount(9), 0);
	assert.equal(hub.channels.size, 0);
	assert.deepEqual(received, []);
});

test("log follow hub enforces per-user limits and removes empty channels", () => {
	const hub = new NginxLogFollowHub();
	const makeChannel = (key, subscriptions) => ({
		key,
		target: {},
		subscribers: new Map(subscriptions),
		polling: false,
		queued: false,
		watcher: { close: () => undefined },
		timer: null,
	});
	const first = makeChannel("one", [["a", { id: "a", userId: 9, onEvent: () => undefined }]]);
	const second = makeChannel("two", [["b", { id: "b", userId: 9, onEvent: () => undefined }]]);
	hub.channels.set(first.key, first);
	hub.channels.set(second.key, second);

	assert.equal(hub.getUserStreamCount(9), MAX_STREAMS_PER_USER);
	assert.throws(
		() => hub.subscribe({ target: { scope: "x", id: 1, logKind: "error" }, userId: 9 }),
		(error) => error.status === 429 && error.message.includes("Too many"),
	);
	hub.unsubscribe("missing", "a");
	hub.unsubscribe("one", "a");
	assert.equal(hub.channels.has("one"), false);
	hub.unsubscribe("two", "missing");
	assert.equal(hub.channels.has("two"), true);
	hub.closeAll();
});

test("log follow hub schedules safely and closes active clients", async () => {
	const hub = new NginxLogFollowHub();
	const events = [];
	let watcherClosed = false;
	const channel = {
		key: "channel",
		target: {},
		subscribers: new Map([
			["paused", { id: "paused", userId: 1, canSend: () => false, onEvent: (...args) => events.push(args) }],
		]),
		polling: false,
		queued: false,
		watcher: { close: () => { watcherClosed = true; } },
		timer: null,
	};
	hub.channels.set(channel.key, channel);

	hub.schedule(null);
	channel.polling = true;
	hub.schedule(channel);
	assert.equal(channel.queued, true);
	channel.polling = false;
	channel.queued = false;
	await hub.poll(channel);
	assert.equal(channel.polling, false);
	assert.deepEqual(events, []);
	hub.closeAll();
	assert.equal(watcherClosed, true);
	assert.deepEqual(events, [["close", { reason: "shutdown" }]]);
	assert.equal(hub.channels.size, 0);
});
