import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-internal-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: internalReport },
	{ default: proxyHost },
	{ default: redirectionHost },
	{ default: stream },
	{ default: deadHost },
	{ default: upstream },
	{ default: internalSetting },
	{ default: settingModel },
] = await Promise.all([
	import("../internal/report.js"),
	import("../internal/proxy-host.js"),
	import("../internal/redirection-host.js"),
	import("../internal/stream.js"),
	import("../internal/dead-host.js"),
	import("../internal/upstream.js"),
	import("../internal/setting.js"),
	import("../models/setting.js"),
]);

const access = (visibility = "all") => ({
	can: async () => ({ permission_visibility: visibility }),
	token: { getUserId: () => 9 },
});

test("host report combines all visible host-family counts", async () => {
	const services = [proxyHost, redirectionHost, stream, deadHost, upstream];
	const originals = services.map((service) => service.getCount);
	services.forEach((service, index) => {
		service.getCount = async (userId, visibility) => {
			assert.equal(userId, 9);
			assert.equal(visibility, "user");
			return index + 1;
		};
	});
	try {
		assert.deepEqual(await internalReport.getHostsReport(access("user")), {
			proxy: 1,
			redirection: 2,
			stream: 3,
			dead: 4,
			upstream: 5,
		});
	} finally {
		services.forEach((service, index) => {
			service.getCount = originals[index];
		});
	}
});

test("setting service gets, counts, lists, updates, and reports missing rows", async () => {
	const originalQuery = settingModel.query;
	let row = { id: "theme", value: "dark", description: "Theme" };
	settingModel.query = () => ({
		where() {
			return {
				first: async () => row,
				patch: async (data) => {
					row = { ...row, ...data };
				},
			};
		},
		count() {
			return { first: async () => ({ count: "3" }) };
		},
		orderBy: async (column, direction) => {
			assert.equal(column, "description");
			assert.equal(direction, "ASC");
			return [row];
		},
	});

	try {
		assert.deepEqual(await internalSetting.get(access(), { id: "theme" }), row);
		assert.equal(await internalSetting.getCount(access()), 3);
		assert.deepEqual(await internalSetting.getAll(access()), [row]);
		assert.deepEqual(await internalSetting.update(access(), { id: "theme", value: "light" }), {
			id: "theme",
			value: "light",
			description: "Theme",
		});

		row = null;
		await assert.rejects(() => internalSetting.get(access(), { id: "missing" }), /Not Found/);
	} finally {
		settingModel.query = originalQuery;
	}
});

test("setting update rejects an unexpected row identity", async () => {
	const originalGet = internalSetting.get;
	internalSetting.get = async () => ({ id: "different" });
	try {
		await assert.rejects(
			() => internalSetting.update(access(), { id: "theme", value: "light" }),
			/IDs do not match/,
		);
	} finally {
		internalSetting.get = originalGet;
	}
});
