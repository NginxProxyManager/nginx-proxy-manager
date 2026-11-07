import assert from "node:assert/strict";
import { test } from "node:test";
import { createStepUpLimiter } from "../lib/api-token-step-up.js";

const isLimited = (error) => error.status === 429 && error.public === true && error.retryAfter > 0;

test("five failed verifications block further work until the fixed window expires", async () => {
	let time = 0;
	let calls = 0;
	const verify = createStepUpLimiter({ now: () => time });
	const fail = () => {
		calls++;
		return false;
	};
	for (let i = 0; i < 5; i++) assert.equal(await verify(1, fail), false);
	await assert.rejects(
		verify(1, () => {
			calls++;
			return true;
		}),
		isLimited,
	);
	assert.equal(calls, 5);
	time = 15 * 60 * 1000 - 1;
	await assert.rejects(verify(1, fail), (error) => isLimited(error) && error.retryAfter === 1);
	time++;
	assert.equal(await verify(1, () => true), true);
});

test("successful verification resets failures, and users have independent counters", async () => {
	const verify = createStepUpLimiter();
	for (let i = 0; i < 4; i++) await verify(1, () => false);
	assert.equal(await verify(1, () => true), true);
	for (let i = 0; i < 5; i++) assert.equal(await verify(1, () => false), false);
	await assert.rejects(verify(1, () => true), isLimited);
	assert.equal(await verify(2, () => true), true);
});

test("one verification per user is in flight, including beyond a failure window", async () => {
	let time = 0;
	let finish;
	const verify = createStepUpLimiter({ now: () => time });
	const pending = verify(
		1,
		() => new Promise((resolve) => {
			finish = resolve;
		}),
	);
	time = 60 * 60 * 1000;
	await assert.rejects(verify(1, () => true), isLimited);
	assert.equal(await verify(2, () => true), true);
	finish(true);
	assert.equal(await pending, true);
	assert.equal(await verify(1, () => true), true);
});

test("thrown verification errors release the lock and consume a failed attempt", async () => {
	const verify = createStepUpLimiter({ maxFailures: 2 });
	const failure = new Error("synthetic verification failure");
	await assert.rejects(
		verify(1, () => {
			throw failure;
		}),
		(error) => error === failure,
	);
	await assert.rejects(
		verify(1, async () => {
			throw failure;
		}),
		(error) => error === failure,
	);
	await assert.rejects(verify(1, () => true), isLimited);
});

test("state capacity fails closed without evicting a blocked user and prunes expired entries", async () => {
	let time = 0;
	const verify = createStepUpLimiter({ maxUsers: 2, maxFailures: 1, windowMs: 1000, now: () => time });
	await verify(1, () => false);
	await verify(2, () => false);
	await assert.rejects(verify(3, () => true), isLimited);
	await assert.rejects(verify(1, () => true), isLimited);
	time = 1000;
	assert.equal(await verify(3, () => true), true);
	assert.equal(await verify(1, () => true), true);
});

test("capacity cleanup never evicts an in-flight verification", async () => {
	let time = 0;
	let finish;
	const verify = createStepUpLimiter({ maxUsers: 1, now: () => time });
	const pending = verify(
		1,
		() => new Promise((resolve) => {
			finish = resolve;
		}),
	);
	time = 60 * 60 * 1000;
	await assert.rejects(verify(2, () => true), isLimited);
	finish(false);
	await pending;
	assert.equal(await verify(1, () => true), true);
	assert.equal(await verify(2, () => true), true);
});
