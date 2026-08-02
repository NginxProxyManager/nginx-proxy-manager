import fs from "node:fs";
import { randomUUID } from "node:crypto";
import errs from "../lib/error.js";
import { getLogRoot, incremental } from "./nginx-log-reader.js";

const POLL_INTERVAL_MS = 500;
const MAX_STREAMS_PER_USER = 2;

const rateLimitError = () => {
	const error = new errs.ValidationError("Too many active Nginx log streams");
	error.status = 429;
	return error;
};

const channelKey = (target) => `${target.scope}:${target.id}:${target.logKind}`;

class NginxLogFollowHub {
	constructor() {
		this.channels = new Map();
	}

	getUserStreamCount(userId) {
		let count = 0;
		for (const channel of this.channels.values()) {
			for (const subscription of channel.subscribers.values()) {
				if (subscription.userId === userId) count += 1;
			}
		}
		return count;
	}

	createChannel(target) {
		const key = channelKey(target);
		const channel = {
			key,
			target,
			subscribers: new Map(),
			polling: false,
			queued: false,
			watcher: null,
			timer: null,
		};

		const schedule = () => this.schedule(channel);
		try {
			channel.watcher = fs.watch(getLogRoot(), { persistent: false }, (_eventType, filename) => {
				if (filename && String(filename) !== target.fileName) return;
				schedule();
			});
			channel.watcher.on("error", () => {
				// stat polling below is the source of correctness. A watcher is only
				// an optional low-latency wake-up signal and may fail on mounted volumes.
				channel.watcher?.close();
				channel.watcher = null;
			});
		} catch {
			// The log directory or file may not exist yet. The interval still detects
			// future creation without turning this into an API failure.
		}
		channel.timer = setInterval(schedule, POLL_INTERVAL_MS);
		channel.timer.unref?.();
		this.channels.set(key, channel);
		return channel;
	}

	subscribe({ target, userId, cursor, onEvent, canSend }) {
		if (this.getUserStreamCount(userId) >= MAX_STREAMS_PER_USER) throw rateLimitError();
		const key = channelKey(target);
		const channel = this.channels.get(key) || this.createChannel(target);
		const id = randomUUID();
		channel.subscribers.set(id, { id, userId, cursor, onEvent, canSend });
		return {
			unsubscribe: () => this.unsubscribe(key, id),
			poll: () => this.schedule(channel),
		};
	}

	unsubscribe(key, id) {
		const channel = this.channels.get(key);
		if (!channel) return;
		channel.subscribers.delete(id);
		if (channel.subscribers.size) return;
		channel.watcher?.close();
		clearInterval(channel.timer);
		this.channels.delete(key);
	}

	schedule(channel) {
		if (!channel || !this.channels.has(channel.key)) return;
		if (channel.polling) {
			channel.queued = true;
			return;
		}
		queueMicrotask(() => this.poll(channel));
	}

	async poll(channel) {
		if (!channel || !this.channels.has(channel.key) || channel.polling) return;
		channel.polling = true;
		try {
			for (const subscription of [...channel.subscribers.values()]) {
				if (!subscription.canSend()) continue;
				try {
					const result = await incremental({
						target: channel.target,
						cursor: subscription.cursor,
						userId: subscription.userId,
					});
					if (!result.reset && !result.content) continue;
					const event = result.reset ? "reset" : "append";
					const accepted = subscription.onEvent(event, result, result.next_cursor);
					subscription.cursor = result.next_cursor;
					if (!accepted) this.unsubscribe(channel.key, subscription.id);
				} catch (_error) {
					// Do not retry a broken subscription forever. The client receives a
					// terminal error and can obtain a fresh snapshot if appropriate.
					subscription.onEvent("error", { code: "read_failed", message: "Unable to follow Nginx log" });
					this.unsubscribe(channel.key, subscription.id);
				}
			}
		} finally {
			channel.polling = false;
			if (channel.queued) {
				channel.queued = false;
				this.schedule(channel);
			}
		}
	}

	closeAll() {
		for (const channel of this.channels.values()) {
			for (const subscription of channel.subscribers.values()) {
				subscription.onEvent("close", { reason: "shutdown" });
			}
			channel.watcher?.close();
			clearInterval(channel.timer);
		}
		this.channels.clear();
	}
}

export { MAX_STREAMS_PER_USER, NginxLogFollowHub };
export default new NginxLogFollowHub();
