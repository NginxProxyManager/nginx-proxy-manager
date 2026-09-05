import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-setup-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	setup,
	{ default: userModel },
	{ default: authModel },
	{ default: permissionModel },
	{ default: settingModel },
	{ default: certificateModel },
	{ default: utils },
] = await Promise.all([
	import("../setup.js"),
	import("../models/user.js"),
	import("../models/auth.js"),
	import("../models/user_permission.js"),
	import("../models/setting.js"),
	import("../models/certificate.js"),
	import("../lib/utils.js"),
]);

const selectable = (row) => {
	const chain = { select: () => chain, where: () => chain, first: async () => row };
	return chain;
};

test("setup state reflects whether an active user exists", async () => {
	const original = userModel.query;
	try {
		userModel.query = () => selectable({ id: 7 });
		assert.equal(await setup.isSetup(), true);
		userModel.query = () => selectable(null);
		assert.equal(await setup.isSetup(), false);
	} finally {
		userModel.query = original;
	}
});

test("default user setup honors configuration and creates all required records", async () => {
	const originals = [userModel.query, authModel.query, permissionModel.query];
	const previousEmail = process.env.INITIAL_ADMIN_EMAIL;
	const previousPassword = process.env.INITIAL_ADMIN_PASSWORD;
	const inserted = [];
	try {
		delete process.env.INITIAL_ADMIN_EMAIL;
		delete process.env.INITIAL_ADMIN_PASSWORD;
		assert.equal(await setup.setupDefaultUser(), undefined);

		process.env.INITIAL_ADMIN_EMAIL = "owner@example.test";
		process.env.INITIAL_ADMIN_PASSWORD = "strong-password";
		userModel.query = () => ({
			...selectable(null),
			insertAndFetch: async (data) => {
				inserted.push(data);
				return { ...data, id: 7 };
			},
		});
		authModel.query = () => ({ insert: async (data) => inserted.push(data) });
		permissionModel.query = () => ({ insert: async (data) => inserted.push(data) });
		await setup.setupDefaultUser();
		assert.equal(inserted.length, 3);
		assert.equal(inserted[0].email, "owner@example.test");
		assert.deepEqual(inserted[0].roles, ["admin"]);
		assert.equal(inserted[1].secret, "strong-password");
		assert.equal(inserted[2].proxy_hosts, "manage");

		userModel.query = () => selectable({ id: 7 });
		await setup.setupDefaultUser();
		assert.equal(inserted.length, 3);
	} finally {
		[userModel.query, authModel.query, permissionModel.query] = originals;
		if (previousEmail === undefined) delete process.env.INITIAL_ADMIN_EMAIL;
		else process.env.INITIAL_ADMIN_EMAIL = previousEmail;
		if (previousPassword === undefined) delete process.env.INITIAL_ADMIN_PASSWORD;
		else process.env.INITIAL_ADMIN_PASSWORD = previousPassword;
	}
});

test("default settings are inserted only when missing", async () => {
	const original = settingModel.query;
	const inserted = [];
	try {
		settingModel.query = () => ({ ...selectable(null), insert: async (data) => inserted.push(data) });
		await setup.setupDefaultSettings();
		assert.equal(inserted[0].id, "default-site");
		settingModel.query = () => ({ ...selectable({ id: "default-site" }), insert: async (data) => inserted.push(data) });
		await setup.setupDefaultSettings();
		assert.equal(inserted.length, 1);
	} finally {
		settingModel.query = original;
	}
});

test("certbot setup is a no-op when no matching certificates exist", async () => {
	const original = certificateModel.query;
	try {
		const chain = { where: () => chain, andWhere: () => chain, then: (resolve, reject) => Promise.resolve([]).then(resolve, reject) };
		certificateModel.query = () => chain;
		await setup.setupCertbotPlugins();
	} finally {
		certificateModel.query = original;
	}
});

test("log rotation runs immediately and handles command failure", async () => {
	const originalExec = utils.exec;
	const originalSetInterval = globalThis.setInterval;
	let scheduled;
	globalThis.setInterval = (callback, timeout) => {
		scheduled = { callback, timeout };
		return 1;
	};
	try {
		utils.exec = async (command) => {
			assert.equal(command, "logrotate /etc/logrotate.d/nginx-proxy-manager");
		};
		await setup.setupLogrotation();
		assert.equal(scheduled.timeout, 1000 * 60 * 60 * 24 * 2);
		utils.exec = async () => { throw new Error("logrotate unavailable"); };
		await scheduled.callback();
	} finally {
		utils.exec = originalExec;
		globalThis.setInterval = originalSetInterval;
	}
});
