import assert from "node:assert/strict";
import { test } from "node:test";
import { withUpstreamNameLocks } from "../../backend/lib/upstream-name-lock.js";

const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

test("upstream-name locks serialize a shared name while unrelated names run", { timeout: 5000 }, async (t) => {
	const firstEntered = deferred();
	const releaseFirst = deferred();
	t.after(() => releaseFirst.resolve());
	const events = [];

	const first = withUpstreamNameLocks(["beta", "alpha"], async () => {
		events.push("first-start");
		firstEntered.resolve();
		await releaseFirst.promise;
		events.push("first-end");
	});

	await firstEntered.promise;
	const sameName = withUpstreamNameLocks(["alpha"], async () => {
		events.push("same-start");
	});
	const differentName = withUpstreamNameLocks(["gamma"], async () => {
		events.push("different-start");
	});

	await differentName;
	assert.deepEqual(events, ["first-start", "different-start"]);

	releaseFirst.resolve();
	await Promise.all([first, sameName]);
	assert.deepEqual(events, ["first-start", "different-start", "first-end", "same-start"]);
});

test("upstream-name locks release after a callback fails", async () => {
	await assert.rejects(
		withUpstreamNameLocks(["alpha"], async () => {
			throw new Error("expected failure");
		}),
		/expected failure/,
	);

	let completed = false;
	await withUpstreamNameLocks(["alpha"], async () => {
		completed = true;
	});
	assert.equal(completed, true);
});

test("nested ownership does not let an independent request bypass the lock", { timeout: 5000 }, async (t) => {
	const entered = deferred();
	const release = deferred();
	t.after(() => release.resolve());
	const events = [];
	const first = withUpstreamNameLocks(["nested"], async () => {
		await withUpstreamNameLocks(["nested"], async () => events.push("nested"));
		entered.resolve();
		await release.promise;
	});
	await entered.promise;
	const second = withUpstreamNameLocks(["nested"], async () => events.push("independent"));
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(events, ["nested"]);
	release.resolve();
	await Promise.all([first, second]);
	assert.deepEqual(events, ["nested", "independent"]);
});

test("a detached continuation cannot reuse released lock ownership", { timeout: 5000 }, async (t) => {
	const resume = deferred();
	const release = deferred();
	t.after(() => {
		resume.resolve();
		release.resolve();
	});
	let detached;
	let ran = false;
	await withUpstreamNameLocks(["expired"], async () => {
		detached = resume.promise.then(() =>
			withUpstreamNameLocks(["expired"], async () => {
				ran = true;
			}),
		);
	});
	const entered = deferred();
	const current = withUpstreamNameLocks(["expired"], async () => {
		entered.resolve();
		await release.promise;
	});
	await entered.promise;
	resume.resolve();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(ran, false);
	release.resolve();
	await Promise.all([current, detached]);
	assert.equal(ran, true);
});
