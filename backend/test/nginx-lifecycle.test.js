import assert from "node:assert/strict";
import test from "node:test";
import createPromiseQueue from "../lib/promise-queue.js";

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("serializes Nginx configuration lifecycle tasks", async () => {
	const queue = createPromiseQueue();
	const events = [];
	let releaseFirst;
	const firstGate = new Promise((resolve) => {
		releaseFirst = resolve;
	});

	const first = queue(async () => {
		events.push("first:start");
		await firstGate;
		events.push("first:end");
	});
	const second = queue(async () => {
		events.push("second:start");
	});

	await nextTurn();
	assert.deepEqual(events, ["first:start"]);
	releaseFirst();
	await Promise.all([first, second]);
	assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("continues the lifecycle queue after a failed task", async () => {
	const queue = createPromiseQueue();
	await assert.rejects(
		queue(async () => {
			throw new Error("expected lifecycle failure");
		}),
		/expected lifecycle failure/,
	);

	const result = await queue(async () => "next task ran");
	assert.equal(result, "next task ran");
});
