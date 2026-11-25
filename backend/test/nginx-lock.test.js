import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLock } from "../lib/nginx-lock.js";

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createLock", () => {
	it("runs sections one after the other", async () => {
		const { withLock } = createLock();
		const events = [];
		const a = withLock(async () => {
			events.push("a start");
			await tick(20);
			events.push("a end");
		});
		const b = withLock(async () => {
			events.push("b start");
			events.push("b end");
		});
		await Promise.all([a, b]);
		assert.deepEqual(events, ["a start", "a end", "b start", "b end"]);
	});

	it("is re-entrant inside the running section", async () => {
		const { withLock, isHeld } = createLock();
		const result = await withLock(async () => {
			assert.equal(isHeld(), true);
			return withLock(async () => "inner");
		});
		assert.equal(result, "inner");
		assert.equal(isHeld(), false);
	});

	it("keeps going after a section throws", async () => {
		const { withLock } = createLock();
		await assert.rejects(
			withLock(async () => {
				throw new Error("boom");
			}),
			/boom/,
		);
		assert.equal(await withLock(async () => 1), 1);
	});

	it("a timer created inside a finished section queues for the lock", async () => {
		const { withLock, isHeld } = createLock();
		const events = [];
		let timerDone;
		const timerFinished = new Promise((resolve) => {
			timerDone = resolve;
		});
		await withLock(async () => {
			// no runOutsideLock: the timer still inherits the lock context
			setTimeout(() => {
				events.push(`timer sees held=${isHeld()}`);
				withLock(async () => {
					events.push("timer section");
				}).then(timerDone);
			}, 5);
		});
		// another caller takes the lock before the timer fires and holds it
		const other = withLock(async () => {
			events.push("other start");
			await tick(30);
			events.push("other end");
		});
		await Promise.all([other, timerFinished]);
		assert.deepEqual(events, ["other start", "timer sees held=false", "other end", "timer section"]);
	});

	it("runOutsideLock drops the lock context", async () => {
		const { withLock, runOutsideLock, isHeld } = createLock();
		await withLock(async () => {
			assert.equal(isHeld(), true);
			runOutsideLock(() => {
				assert.equal(isHeld(), false);
			});
			assert.equal(isHeld(), true);
		});
	});
});
